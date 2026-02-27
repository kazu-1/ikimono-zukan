import datetime
import io
import os
from typing import List, Optional
from fastapi import FastAPI, File, Form, Request, Response, UploadFile
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
from supabase import Client, create_client
from PIL import Image, ImageOps
from PIL.ExifTags import TAGS, GPSTAGS
from geopy.geocoders import Nominatim


app = FastAPI()
templates = Jinja2Templates(directory=".")
app.mount("/photo", StaticFiles(directory="photo"), name="photo")

# --- Supabase設定 ---
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    # ローカル実行時のためのフォールバック（必要に応じて書き換え）
    print("⚠️ 環境変数が未設定です。ローカル設定を試みます。")
    SUPABASE_URL = "https://snogytqcoylmyownkwgu.supabase.co"
    SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNub2d5dHFjb3lsbXlvd25rd2d1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwOTA5NTUsImV4cCI6MjA4NzY2Njk1NX0.Fs45UESjxP8I19-GB_x45AFqtNeFSp7XjI7SREW38wg"

try:
    # 前後の空白を削除して接続
    supabase: Client = create_client(SUPABASE_URL.strip(), SUPABASE_KEY.strip())
    print("✅ Supabase client created successfully.")
except Exception as e:
    print(f"❌ Failed to create Supabase client: {e}")
    raise e

# --- 住所取得関数 ---
def get_address_from_coords(lat, lon):
    try:
        geolocator = Nominatim(user_agent="my_creature_app_v1")
        # addressdetails=True を指定することで、市区町村などの詳細データを取得
        location = geolocator.reverse(f"{lat}, {lon}", language='ja', addressdetails=True)
        
        if location and 'address' in location.raw:
            addr = location.raw['address']
            prefecture = addr.get('province') or addr.get('state') or ""  # 三重県
            city = addr.get('city') or addr.get('town') or addr.get('village') or addr.get('city_district') or "" # 松阪市
            suburb = addr.get('suburb') or "" # 飯高町
            neighbourhood = addr.get('neighbourhood') or "" # 赤桶
            
            full_addr = f"{prefecture}{city}{suburb}{neighbourhood}"
            
            return full_addr if full_addr else location.address
            
        return None
    except Exception as e:
        print(f"住所取得エラー: {e}")
        return None

# --- 位置情報を抜き出す補助関数 ---
def get_gps_location(image_content):
    try:
        image = Image.open(io.BytesIO(image_content))
        exif = image._getexif()
        if not exif:
            return None, None

        gps_info = {}
        for tag, value in exif.items():
            decoded = TAGS.get(tag, tag)
            if decoded == "GPSInfo":
                for t in value:
                    sub_decoded = GPSTAGS.get(t, t)
                    gps_info[sub_decoded] = value[t]

        if "GPSLatitude" in gps_info and "GPSLongitude" in gps_info:
            def convert_to_degrees(value):
                d = float(value[0])
                m = float(value[1])
                s = float(value[2])
                return d + (m / 60.0) + (s / 3600.0)

            lat = convert_to_degrees(gps_info["GPSLatitude"])
            if gps_info.get("GPSLatitudeRef") == "S": lat = -lat
            
            lon = convert_to_degrees(gps_info["GPSLongitude"])
            if gps_info.get("GPSLongitudeRef") == "W": lon = -lon
            
            return lat, lon
    except Exception as e:
        print(f"位置情報解析エラー: {e}")
    return None, None

# --- ログイン画面を表示する ---
@app.get("/login", response_class=HTMLResponse)
async def login_page(request: Request):
    return templates.TemplateResponse("login.html", {"request": request})

# --- 認証処理をする ---
@app.post("/auth")
async def auth(
    request: Request,
    email: str = Form(...),
    password: str = Form(...),
    username: str = Form(None), # 新規登録時のみ使用
    action: str = Form(...)
):
    try:
        if action == "signup":
            # 新規登録を実行
            supabase.auth.sign_up({
                "email": email, 
                "password": password,
                "options": {
                    "data": {
                        "display_name": username
                    }
                }
            })
            
            # 登録成功時は、ログイン画面に戻して成功メッセージを表示
            return templates.TemplateResponse("login.html", {
                "request": request,
                "success": "アカウントを作成しました！さっそくログインしてみよう。"
            })
            
        else:
            # ログインを実行
            res = supabase.auth.sign_in_with_password({"email": email, "password": password})
            
            # ログイン成功時はトップ画面へリダイレクト
            response = RedirectResponse(url="/", status_code=303)
            response.set_cookie(key="access_token", value=res.session.access_token)
            return response

    except Exception as e:
        error_msg = str(e)
        # エラーメッセージの日本語化（ここは以前のまま）
        if "6 characters" in error_msg:
            friendly_msg = "パスワードは6文字以上で入力してください。"
        elif "Invalid login credentials" in error_msg:
            friendly_msg = "メールアドレスまたはパスワードが正しくありません。"
        elif "already registered" in error_msg:
            friendly_msg = "このメールアドレスは既に登録されています。"
        else:
            friendly_msg = f"エラー: {error_msg}"
        
        return templates.TemplateResponse("login.html", {
            "request": request, 
            "error": friendly_msg
        })

# ログイン状態をチェックする補助関数
def get_user_from_cookie(request: Request):
    token = request.cookies.get("access_token")
    if not token:
        return None
    try:
        # Supabaseに「このトークンは有効か？」を確認
        user = supabase.auth.get_user(token)
        return user
    except:
        return None

# ログアウト
@app.get("/logout")
async def logout():
    response = RedirectResponse(url="/login", status_code=303)
    # ブラウザのCookieを削除する
    response.delete_cookie("access_token")
    return response

# 【1】 一覧表示ページ（生き物図鑑）
@app.get("/", response_class=HTMLResponse)
async def index_page(request: Request):
    user = get_user_from_cookie(request)
    if not user:
        return RedirectResponse(url="/login", status_code=303)
    try:
        response = supabase.table("observations").select("*").order("created_at", desc=True).execute()
        items = response.data
    except Exception as e:
        print(f"データ取得エラー: {e}")
        items = []
    # index.html (投稿用フォームがあるページ) を表示
    return templates.TemplateResponse("index.html", {"request": request, "items": items})

# 【2】 アップロード用ページを表示
@app.get("/upload", response_class=HTMLResponse)
async def upload_page(request: Request):
    user = get_user_from_cookie(request)
    if not user:
        return RedirectResponse(url="/login", status_code=303)
    return templates.TemplateResponse("upload.html", {"request": request})

# 【3】 新規投稿（リサイズ・位置情報対応）
@app.post("/do_upload")
async def do_upload(
    request: Request,
    species_name: Optional[str] = Form(None),
    is_identified: bool = Form(False),
    observed_on: str = Form(...),
    category: str = Form(...),
    notes: Optional[str] = Form(None),
    location_name: Optional[str] = Form(None),
    files: List[UploadFile] = File(...)
):
    # --- 1. ログインチェックとメタデータの取得 ---
    token = request.cookies.get("access_token")
    if not token:
        return JSONResponse(status_code=401, content={"error": "ログインが必要です"})
    
    try:
        user_res = supabase.auth.get_user(token)
        user = user_res.user
        user_id = user.id
        
        # メタデータから display_name を取得（なければメアドを代用する安全策）
        display_name = user.user_metadata.get("display_name") or user.email
        
    except Exception:
        return JSONResponse(status_code=401, content={"error": "認証に失敗しました"})

    image_urls = []
    lat, lon = None, None
    final_address = None

    try:
        for file in files:
            raw_content = await file.read()
            if not raw_content: continue

            if lat is None and lon is None:
                lat, lon = get_gps_location(raw_content)
                if lat and lon:
                    final_address = get_address_from_coords(lat, lon)

            img = Image.open(io.BytesIO(raw_content))
            img = ImageOps.exif_transpose(img)
            max_size = 1280
            if max(img.width, img.height) > max_size:
                img.thumbnail((max_size, max_size), Image.LANCZOS)

            optimized_io = io.BytesIO()
            img.convert("RGB").save(optimized_io, format="JPEG", quality=85, optimize=True)
            optimized_content = optimized_io.getvalue()

            file_path = f"observations/{datetime.datetime.now().timestamp()}.jpg"
            supabase.storage.from_("photos").upload(path=file_path, file=optimized_content, file_options={"content-type": "image/jpeg"})
            public_url = supabase.storage.from_("photos").get_public_url(file_path)
            image_urls.append(public_url)

        if not final_address:
            if location_name and location_name.strip():
                final_address = location_name
            else:
                return JSONResponse(
                    status_code=400,
                    content={
                        "status": "need_location",
                        "message": "場所情報を入力してください。"
                    }
                )

        # --- 2. DB登録（ユーザー名を使用） ---
        insert_data = {
            "user_id": user_id,
            "created_by": display_name,  # 最初の登録者名
            "updated_by": display_name,  # 最終更新者名（初期値）
            "species_name": species_name,
            "is_identified": is_identified,
            "observed_on": observed_on,
            "location_name": final_address,
            "category": category,
            "notes": notes,
            "image_urls": image_urls,
            "latitude": lat,
            "longitude": lon
        }
        supabase.table("observations").insert(insert_data).execute()
        
    except Exception as e:
        print(f"エラー: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})
    
    return JSONResponse(content={"status": "success"})

# 【4】 更新処理（モーダル用）
@app.post("/do_update/{id}")
async def do_update(
    id: str,
    username: str = Form(...),
    species_name: Optional[str] = Form(None),
    is_identified: bool = Form(False),
    observed_on: str = Form(...),
    location_name: str = Form(...),
    category: str = Form(...),
    notes: Optional[str] = Form(None)
):
    update_data = {
        "username": username,
        "species_name": species_name,
        "is_identified": is_identified,
        "observed_on": observed_on,
        "location_name": location_name,
        "category": category,
        "notes": notes
    }
    supabase.table("observations").update(update_data).eq("id", id).execute()
    return JSONResponse(content={"status": "success"})

# 【5】 全体マップページを表示
@app.get("/map", response_class=HTMLResponse)
async def map_page(request: Request):
    try:
        response = supabase.table("observations").select("*").not_.is_("latitude", "null").execute()
        items = response.data
    except Exception as e:
        print(f"地図データ取得エラー: {e}")
        items = []
    return templates.TemplateResponse("map_view.html", {"request": request, "items": items})

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
import datetime
import io
import os
import json
from typing import List, Optional
from dotenv import load_dotenv
load_dotenv()
from fastapi import FastAPI, File, Form, Request, Response, UploadFile
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
from supabase import Client, create_client
from PIL import Image, ImageOps
from PIL.ExifTags import GPSTAGS
from geopy.geocoders import Nominatim
from google import genai
from google.genai import types

# Gemini APIの初期化
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
if GEMINI_API_KEY:
    gemini_client = genai.Client(api_key=GEMINI_API_KEY)
    print("✅ Gemini API client initialized.")
else:
    gemini_client = None
    print("⚠️ GEMINI_API_KEYが設定されていません。")

app = FastAPI()
templates = Jinja2Templates(directory=".")
app.mount("/photo", StaticFiles(directory="photo"), name="photo")

# --- Supabase設定 ---
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise RuntimeError("環境変数 SUPABASE_URL と SUPABASE_KEY を設定してください。")

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
        geolocator = Nominatim(user_agent="ishimaki-ikimono-zukan/1.0", timeout=10)
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

        # 新しいPillow APIで GPS IFD（タグID: 34853）を取得
        exif = image.getexif()
        if not exif:
            print("位置情報: EXIFデータなし")
            return None, None

        gps_ifd = exif.get_ifd(34853)
        if not gps_ifd:
            print("位置情報: GPS情報なし")
            return None, None

        gps_info = {GPSTAGS.get(tag, tag): value for tag, value in gps_ifd.items()}

        if "GPSLatitude" in gps_info and "GPSLongitude" in gps_info:
            def convert_to_degrees(value):
                d = float(value[0])
                m = float(value[1])
                s = float(value[2])
                return d + (m / 60.0) + (s / 3600.0)

            lat = convert_to_degrees(gps_info["GPSLatitude"])
            if gps_info.get("GPSLatitudeRef") == "S":
                lat = -lat

            lon = convert_to_degrees(gps_info["GPSLongitude"])
            if gps_info.get("GPSLongitudeRef") == "W":
                lon = -lon

            print(f"位置情報取得成功: lat={lat:.6f}, lon={lon:.6f}")
            return lat, lon

        print("位置情報: GPSLatitude/Longitudeが見つかりません")
    except Exception as e:
        print(f"位置情報解析エラー: {e}")
    return None, None

@app.post("/get_location")
async def get_location(file: UploadFile = File(...)):
    try:
        content = await file.read()
        if not content:
            return JSONResponse(content={"address": None, "has_gps": False})

        lat, lon = get_gps_location(content)
        if lat is None or lon is None:
            return JSONResponse(content={"address": None, "has_gps": False})

        # GPS座標はあるが住所変換できなかった場合も has_gps=True
        address = get_address_from_coords(lat, lon)
        return JSONResponse(content={"address": address, "lat": lat, "lon": lon, "has_gps": True})

    except Exception as e:
        print(f"位置情報エンドポイントエラー: {e}")
        return JSONResponse(content={"address": None, "has_gps": False})


@app.post("/suggest_category")
async def get_suggestion(file: UploadFile = File(...)):
    try:
        content = await file.read()

        if not content:
            return JSONResponse(status_code=400, content={"error": "Empty file"})

        if not gemini_client:
            return JSONResponse(status_code=500, content={"error": "Gemini APIキーが設定されていません"})

        # MIMEタイプを判定
        mime_type = file.content_type or "image/jpeg"

        # カテゴリ一覧
        categories = ["さかな", "貝類", "甲殻類", "海藻", "鳥", "植物", "キノコ", "虫", "爬虫類・両生類", "その他"]

        prompt = f"""この画像に写っている生き物を分析してください。

以下のカテゴリから最も適切なものを1つ選んでください:
{", ".join(categories)}

回答は以下のJSON形式のみで返してください（他の文章は不要）:
{{
  "category": "カテゴリ名",
  "species": "生き物の和名（わかれば。不明な場合はnull）"
}}"""

        response = gemini_client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[
                types.Part.from_bytes(data=content, mime_type=mime_type),
                prompt,
            ],
        )

        raw_text = response.text.strip()
        print(f"Gemini response: {raw_text}")

        # JSON部分を抽出
        import re
        json_match = re.search(r'\{.*\}', raw_text, re.DOTALL)
        if json_match:
            result = json.loads(json_match.group())
            suggestion = result.get("category", "その他")
            species = result.get("species")
            if not species or species == "null":
                species = None
        else:
            suggestion = "その他"
            species = None

        print(f"✅ Gemini判定: カテゴリ={suggestion}, 種名={species}")
        return JSONResponse(content={"suggestion": suggestion, "species": species})

    except Exception as e:
        import traceback
        print("--- Detailed Error Traceback ---")
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"error": str(e)})

# --- ログイン画面を表示する ---
@app.get("/login", response_class=HTMLResponse)
async def login_page(request: Request):
    return templates.TemplateResponse(request, "login.html")

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
            return templates.TemplateResponse(request, "login.html", {
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
        
        return templates.TemplateResponse(request, "login.html", {
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

# --- 画像処理の共通関数（新規・更新両方で使用可能） ---
def process_image(raw_content: bytes) -> bytes:
    img = Image.open(io.BytesIO(raw_content))
    img = ImageOps.exif_transpose(img)
    max_size = 1280
    if max(img.width, img.height) > max_size:
        img.thumbnail((max_size, max_size), Image.LANCZOS)

    optimized_io = io.BytesIO()
    img.convert("RGB").save(optimized_io, format="JPEG", quality=85, optimize=True)
    return optimized_io.getvalue()

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
    return templates.TemplateResponse(request, "index.html", {"items": items})

# 【2】 アップロード用ページを表示
@app.get("/upload", response_class=HTMLResponse)
async def upload_page(request: Request):
    user = get_user_from_cookie(request)
    if not user:
        return RedirectResponse(url="/login", status_code=303)
    return templates.TemplateResponse(request, "upload.html")

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
    token = request.cookies.get("access_token")
    if not token:
        return JSONResponse(status_code=401, content={"error": "ログインが必要です"})
    
    try:
        user_res = supabase.auth.get_user(token)
        user = user_res.user
        display_name = user.user_metadata.get("display_name") or user.email
    except Exception:
        return JSONResponse(status_code=401, content={"error": "認証に失敗しました"})

    image_urls = []
    lat, lon = None, None
    final_address = None

    try:
        # 枚数制限の確認（念のため）
        if len(files) > 5:
            return JSONResponse(status_code=400, content={"error": "写真は最大5枚までです"})

        # --- Step1: 全画像を読み込み・処理（まだStorageには保存しない）---
        processed_images = []
        for i, file in enumerate(files):
            raw_content = await file.read()
            if not raw_content: continue

            # 1枚目の画像からのみ位置情報を取得
            if lat is None and lon is None:
                lat, lon = get_gps_location(raw_content)
                if lat and lon:
                    final_address = get_address_from_coords(lat, lon)

            optimized_content = process_image(raw_content)
            processed_images.append(optimized_content)

        # --- Step2: 場所チェック（Storageに保存する前に確認）---
        if not final_address:
            if location_name and location_name.strip():
                final_address = location_name
            else:
                return JSONResponse(status_code=400, content={"status": "need_location", "message": "場所情報を入力してください。"})

        # --- Step3: 場所OKなのでStorageへ保存 ---
        for i, optimized_content in enumerate(processed_images):
            ts = datetime.datetime.now().timestamp()
            file_path = f"observations/{ts}_{i}.jpg"
            supabase.storage.from_("photos").upload(
                path=file_path,
                file=optimized_content,
                file_options={"content-type": "image/jpeg"}
            )
            public_url = supabase.storage.from_("photos").get_public_url(file_path)
            image_urls.append(public_url)

        # DB登録
        insert_data = {
            "user_id": user.id,
            "created_by": display_name,
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
    request: Request,
    species_name: Optional[str] = Form(None),
    is_identified: bool = Form(False),
    observed_on: Optional[str] = Form(None),
    location_name: str = Form(...),
    category: str = Form(...),
    notes: Optional[str] = Form(None),
    existing_urls: str = Form("[]"),  # 💡 削除後の既存URLリストを受け取る
    new_files: List[UploadFile] = File(None)
):
    # --- 1. ログインチェック ---
    token = request.cookies.get("access_token")
    if not token:
        return JSONResponse(status_code=401, content={"error": "ログインが必要です"})
    
    try:
        # get_userの戻り値に合わせて修正（必要に応じて）
        user_res = supabase.auth.get_user(token)
        user = user_res.user
        editor_name = user.user_metadata.get("display_name") or user.email
    except Exception:
        return JSONResponse(status_code=401, content={"error": "認証に失敗しました"})

    try:
        # --- 2. 既存の画像URLリストをJSの送信内容から復元 ---
        # JS側で JSON.stringify されたものを受け取る
        image_urls = json.loads(existing_urls)

        # --- 3. 新しい写真の追加処理 ---
        valid_new_files = [f for f in (new_files or []) if f.filename]
        
        if valid_new_files:
            # 合計5枚制限のチェック（削除後の枚数 + 新規枚数）
            if len(image_urls) + len(valid_new_files) > 5:
                return JSONResponse(
                    status_code=400, 
                    content={"error": f"写真は合計5枚までです（現在{len(image_urls)}枚）"}
                )

            for i, file in enumerate(valid_new_files):
                raw_content = await file.read()
                if not raw_content: continue

                # 画像の最適化（process_image関数がある前提）
                optimized_content = process_image(raw_content)

                ts = datetime.datetime.now().timestamp()
                file_path = f"observations/edit_{id}_{ts}_{i}.jpg"
                
                # Storageへ保存 (PHOTOSバケット名は環境に合わせて)
                supabase.storage.from_("photos").upload(
                    path=file_path, 
                    file=optimized_content, 
                    file_options={"content-type": "image/jpeg"}
                )
                
                public_url = supabase.storage.from_("photos").get_public_url(file_path)
                image_urls.append(public_url)

        # --- 4. 更新用データの作成 ---
        update_data = {
            "updated_by": editor_name,
            "updated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "species_name": species_name,
            "is_identified": is_identified,
            "location_name": location_name,
            "category": category,
            "notes": notes,
            "image_urls": image_urls  # 💡 編集・追加が反映されたリストで上書き
        }

        if observed_on:
            update_data["observed_on"] = observed_on

        # Supabaseの更新実行
        supabase.table("observations").update(update_data).eq("id", id).execute()
        return JSONResponse(content={"status": "success"})

    except Exception as e:
        print(f"更新エラー: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})

# 【5】 全体マップページを表示
@app.get("/map", response_class=HTMLResponse)
async def map_page(request: Request):
    try:
        response = supabase.table("observations").select("*").not_.is_("latitude", "null").execute()
        items = response.data
    except Exception as e:
        print(f"地図データ取得エラー: {e}")
        items = []
    return templates.TemplateResponse(request, "map_view.html", {"items": items})

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)

# 【6】 削除処理
@app.delete("/delete_post/{post_id}")
async def delete_post(post_id: str):
    try:
        # 1. DBから投稿情報を取得
        result = supabase.table("observations").select("image_urls").eq("id", post_id).execute()
        if not result.data:
            return JSONResponse(status_code=404, content={"message": "投稿が見つかりません"})

        image_urls = result.data[0].get("image_urls", [])

        # 2. Storageから削除
        if image_urls:
            file_paths = []
            for url in image_urls:
                if not url: continue
                
                # ✅ 修正ポイント: クエリパラメータ (?) を除去してから解析
                clean_url = url.split("?")[0]
                
                # ✅ 修正ポイント: "public/photos/" 以降のパスをすべて取得する
                # これにより "observations/filename.jpg" が正しく抽出されます
                if "public/photos/" in clean_url:
                    path_in_bucket = clean_url.split("public/photos/")[-1]
                    file_paths.append(path_in_bucket)
            
            if file_paths:
                # 削除実行
                res = supabase.storage.from_("photos").remove(file_paths)
                print(f"✅ Storage削除試行: {file_paths}, 結果: {res}")

        # 3. DBからレコードを削除
        supabase.table("observations").delete().eq("id", post_id).execute()
        
        return {"status": "success"}

    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"detail": str(e)})
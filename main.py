import datetime
import io
import os
from typing import List, Optional
from fastapi import FastAPI, File, Form, Request, UploadFile
from fastapi.responses import HTMLResponse, JSONResponse
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

# 【1】 一覧表示ページ（生き物図鑑）
@app.get("/", response_class=HTMLResponse)
async def index_page(request: Request):
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
    return templates.TemplateResponse("upload.html", {"request": request})

# 【3】 新規投稿（リサイズ・位置情報対応）
@app.post("/do_upload")
async def do_upload(
    username: str = Form(...),
    species_name: Optional[str] = Form(None),
    is_identified: bool = Form(False),
    observed_on: str = Form(...),
    category: str = Form(...),
    notes: Optional[str] = Form(None),
    location_name: Optional[str] = Form(None), # JSからの手入力を受け取る
    files: List[UploadFile] = File(...)
):
    image_urls = []
    lat, lon = None, None
    final_address = None

    try:
        for file in files:
            raw_content = await file.read()
            if not raw_content: continue

            # 1. 写真から位置情報を試行
            if lat is None and lon is None:
                lat, lon = get_gps_location(raw_content)
                if lat and lon:
                    final_address = get_address_from_coords(lat, lon)

            # 2. 画像最適化
            img = Image.open(io.BytesIO(raw_content))
            img = ImageOps.exif_transpose(img)
            max_size = 1280
            if max(img.width, img.height) > max_size:
                img.thumbnail((max_size, max_size), Image.LANCZOS)

            optimized_io = io.BytesIO()
            img.convert("RGB").save(optimized_io, format="JPEG", quality=85, optimize=True)
            optimized_content = optimized_io.getvalue()

            # 3. ストレージ保存
            file_path = f"observations/{datetime.datetime.now().timestamp()}.jpg"
            supabase.storage.from_("photos").upload(path=file_path, file=optimized_content, file_options={"content-type": "image/jpeg"})
            public_url = supabase.storage.from_("photos").get_public_url(file_path)
            image_urls.append(public_url)

        # --- フォールバック判定 ---
        # GPSからの住所がなく、かつ画面からの手入力も空の場合、400エラーで差し戻す
        if not final_address:
            if location_name and location_name.strip():
                final_address = location_name
            else:
                return JSONResponse(
                    status_code=400,
                    content={
                        "status": "need_location",
                        "message": "写真に位置情報が含まれていません。場所を手入力してください。"
                    }
                )

        # 4. DB登録
        insert_data = {
            "username": username,
            "species_name": species_name,
            "is_identified": is_identified,
            "observed_on": observed_on,
            "location_name": final_address, # 自動住所または手入力
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
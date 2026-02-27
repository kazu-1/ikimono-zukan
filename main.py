import datetime
import io
from typing import List, Optional
import os

from fastapi import FastAPI, File, Form, Request, UploadFile
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from supabase import Client, create_client
from PIL import Image, ImageOps
from PIL.ExifTags import TAGS, GPSTAGS

app = FastAPI()
templates = Jinja2Templates(directory=".")

# --- Supabase設定 (デバッグ・ログ付き) ---
# os.environ.get で環境変数を取得
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

# --- RenderのLogs画面に出力される情報 ---
print("\n" + "="*30)
print("DEBUG: ENVIRONMENT VARIABLES CHECK")
print(f"URL: {SUPABASE_URL if SUPABASE_URL else '❌ NOT FOUND'}")

if SUPABASE_KEY:
    # セキュリティのため最初の10文字と文字数だけ表示
    print(f"KEY (Start): {SUPABASE_KEY[:10]}...")
    print(f"KEY (Length): {len(SUPABASE_KEY)} characters")
else:
    print("KEY: ❌ NOT FOUND")
print("="*30 + "\n")

# 環境変数が欠けている場合は、Supabaseクライアントを作る前にエラーを出す
if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("環境変数(SUPABASE_URL/KEY)が正しく設定されていません。RenderのSettingsを確認してください。")

# ここでエラーが出る場合は「値の中身」が間違っています
try:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    print("✅ Supabase client created successfully.")
except Exception as e:
    print(f"❌ Failed to create Supabase client: {e}")
    raise e

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
    location_name: str = Form(...),
    category: str = Form(...),
    notes: Optional[str] = Form(None),
    files: List[UploadFile] = File(...)
):
    image_urls = []
    lat, lon = None, None

    try:
        for file in files:
            raw_content = await file.read()
            if not raw_content: continue

            # 位置情報取得
            if lat is None and lon is None:
                lat, lon = get_gps_location(raw_content)

            # 画像最適化（リサイズ・回転補正）
            img = Image.open(io.BytesIO(raw_content))
            img = ImageOps.exif_transpose(img)
            
            max_size = 1280
            if max(img.width, img.height) > max_size:
                img.thumbnail((max_size, max_size), Image.LANCZOS)

            optimized_io = io.BytesIO()
            img.convert("RGB").save(optimized_io, format="JPEG", quality=85, optimize=True)
            optimized_content = optimized_io.getvalue()

            # ストレージ保存
            file_path = f"observations/{datetime.datetime.now().timestamp()}.jpg"
            supabase.storage.from_("photos").upload(path=file_path, file=optimized_content, file_options={"content-type": "image/jpeg"})
            
            public_url = supabase.storage.from_("photos").get_public_url(file_path)
            image_urls.append(public_url)

        # DB登録
        insert_data = {
            "username": username,
            "species_name": species_name,
            "is_identified": is_identified,
            "observed_on": observed_on,
            "location_name": location_name,
            "category": category,
            "notes": notes,
            "image_urls": image_urls,
            "latitude": lat,
            "longitude": lon
        }
        supabase.table("observations").insert(insert_data).execute()
    except Exception as e:
        print(f"エラー: {e}")
        return HTMLResponse(f"エラーが発生しました: {e}", status_code=500)
    
    # スクリプトを返さず、成功したという「合図」だけ送る
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
    # スクリプトを返さず、成功したという「合図」だけ送る
    return JSONResponse(content={"status": "success"})

# 【5】 全体マップページを表示
@app.get("/map", response_class=HTMLResponse)
async def map_page(request: Request):
    try:
        # 位置情報があるデータだけを取得
        response = supabase.table("observations").select("*").not_.is_("latitude", "null").execute()
        items = response.data
    except Exception as e:
        print(f"地図データ取得エラー: {e}")
        items = []
    return templates.TemplateResponse("map_view.html", {"request": request, "items": items})

if __name__ == "__main__":
    import uvicorn
    import os
    # 環境変数からポート番号を取得し、なければ8000番を使う
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
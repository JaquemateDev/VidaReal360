from yt_dlp import YoutubeDL
import json

playlist_url = "https://www.youtube.com/playlist?list=PL-n1PCDEHSLUiO5y7roEshvbOCQSb9uVy"

ydl_opts = {
    'ignoreerrors': True,
    'quiet': True,
    'extract_flat': True,   # no descargar vídeos, sólo metadatos
}
with YoutubeDL(ydl_opts) as ydl:
    info = ydl.extract_info(playlist_url, download=False)

items = []
for idx, entry in enumerate(info.get('entries', []), start=1):
    if not entry:
        continue
    vid = entry.get('id')
    title = entry.get('title')
    items.append({
        "id": str(idx),
        "label": title,
        "type": "youtube",
        "youtubeId": vid,
        "thumbnail": f"https://img.youtube.com/vi/{vid}/0.jpg"
    })

# Volcar a JSON
with open('playlist.json', 'w', encoding='utf-8') as f:
    json.dump(items, f, indent=4, ensure_ascii=False)

print("✅ He generado el archivo playlist.json con todos los vídeos.")

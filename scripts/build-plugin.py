"""Packages wordpress-plugin/my-office-bot into public/downloads/my-office-bot-wordpress.zip.

Run after changing the plugin: python scripts/build-plugin.py
The zip contains a top-level my-office-bot/ folder, which is what WordPress's "Upload Plugin" expects.
"""

import hashlib
import pathlib
import re
import zipfile

root = pathlib.Path(__file__).resolve().parent.parent
src = root / "wordpress-plugin" / "my-office-bot"
out_dir = root / "public" / "downloads"
out_dir.mkdir(parents=True, exist_ok=True)
out = out_dir / "my-office-bot-wordpress.zip"

version = re.search(r"Version:\s*([\d.]+)", (src / "my-office-bot.php").read_text(encoding="utf-8")).group(1)

with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    for path in sorted(src.rglob("*")):
        if path.is_file():
            # Fixed timestamps so the same source always gives the same zip (and checksum).
            info = zipfile.ZipInfo(str(pathlib.Path("my-office-bot") / path.relative_to(src)).replace("\\", "/"), (2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            z.writestr(info, path.read_bytes())

digest = hashlib.sha256(out.read_bytes()).hexdigest()
(out_dir / "my-office-bot-wordpress.json").write_text(
    f'{{"version": "{version}", "sha256": "{digest}", "file": "/downloads/my-office-bot-wordpress.zip"}}\n', encoding="utf-8"
)
print(f"Built {out.relative_to(root)} v{version} sha256 {digest}")

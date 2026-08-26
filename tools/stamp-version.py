#!/usr/bin/env python3
"""把 index.html 裡本站 js/css 的 ?v= 換成新的戳記。

改到 js/ 或 css/ 的內容後 push 前一定要跑，否則使用者手機會拿到快取的舊檔
（GitHub Pages 回 Cache-Control: max-age=600）。同一天上第二次版就自己帶參數：
    python3 tools/stamp-version.py 20260826b
"""
import re
import sys
import pathlib
import datetime

stamp = sys.argv[1] if len(sys.argv) > 1 else datetime.date.today().strftime("%Y%m%d") + "a"
p = pathlib.Path(__file__).resolve().parent.parent / "index.html"
src = p.read_text(encoding="utf-8")
out, n = re.subn(r'((?:js|css)/[\w.-]+)\?v=[\w]+', lambda m: m.group(1) + "?v=" + stamp, src)
p.write_text(out, encoding="utf-8")
print(f"版本戳 {stamp}：更新 {n} 個 js/css 連結")

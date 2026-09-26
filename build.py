"""Make index.html a complete standalone document (for GitHub Pages / any host),
and emit artifact.html without the <head> wrapper (the Artifact platform injects its own)."""
import io, re, sys

HEAD = '''<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>ونس — إدارة النقدية | WINS Cash Control</title>
<meta name="description" content="منظومة تحصيل وتسليم النقد لفروع ونس — WINS branch cash collection & handover control.">
<meta name="theme-color" content="#06070B">
<!-- GitHub Pages serves this file with a 10-minute cache. These ask the browser
     not to hold its own copy on top of that, so an update shows up sooner. -->
<meta http-equiv="Cache-Control" content="no-cache, must-revalidate">
<meta http-equiv="Pragma" content="no-cache">
<link rel="icon" type="image/png" sizes="64x64" href="favicon-64.png">
<link rel="icon" type="image/png" sizes="192x192" href="icon-192.png">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<link rel="manifest" href="manifest.webmanifest">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="ونس">
<meta name="format-detection" content="telephone=no">
</head>
<body>
'''
FOOT = '\n</body>\n</html>\n'

src = io.open(sys.argv[1] if len(sys.argv) > 1 else "index.html", encoding="utf-8").read()

# Strip any existing document wrapper so this is idempotent.
core = src
if core.lstrip().lower().startswith("<!doctype"):
    core = re.sub(r'(?is)^.*?<body[^>]*>', '', core, count=1)
    core = re.sub(r'(?is)</body>\s*</html>\s*$', '', core, count=1)
core = core.strip()

# The artifact platform injects its own <head> and scans the file for a <title>,
# so the artifact build keeps one inline; the standalone page uses the head title only.
core_no_title = re.sub(r'(?is)<title>.*?</title>\s*', '', core, count=1).strip()
core_artifact = '<title>ونس — إدارة النقدية</title>\n' + core_no_title

io.open("index.html", "w", encoding="utf-8").write(HEAD + core_no_title + FOOT)
io.open("artifact.html", "w", encoding="utf-8").write(core_artifact + "\n")
print("index.html: standalone document (has viewport meta)")
print("artifact.html: bare content for the Artifact platform")

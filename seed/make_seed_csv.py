"""Emit CSVs matching the Apps Script sheet schema: id | updatedAt | data(JSON).
Paste each file into the matching tab of the Google Sheet (or File > Import)."""
import csv, io, json, os, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
data = json.load(io.open(os.path.join(HERE, "seed.json"), encoding="utf-8"))
now = datetime.datetime.now(datetime.timezone.utc).isoformat()

for name, records in data.items():
    path = os.path.join(HERE, name + ".csv")
    with io.open(path, "w", encoding="utf-8-sig", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["id", "updatedAt", "data"])
        for rid, rec in records.items():
            w.writerow([rid, now, json.dumps(rec, ensure_ascii=False)])
    print(f"{name}.csv  ({len(records)} rows)")

# A human-readable users sheet too, for reading rather than syncing.
staff = data.get("staff", {})
branches = data.get("branches", {})
ROLES = {"admin":"مدير عام","manager":"مدير فرع","area":"مدير منطقة",
         "collector":"محصّل","treasury":"الخزينة"}
with io.open(os.path.join(HERE, "users-readable.csv"), "w", encoding="utf-8-sig", newline="") as fh:
    w = csv.writer(fh)
    w.writerow(["المعرف","الاسم","الأدوار (عربي)","roles","الفرع","branchId"])
    for uid, s in staff.items():
        roles = s.get("roles") or [s.get("role")]
        br = branches.get(s.get("branchId") or "", {})
        w.writerow([uid, s.get("name",""),
                    " + ".join(ROLES.get(r, r) for r in roles),
                    " + ".join(roles),
                    br.get("nameAr",""), s.get("branchId") or ""])
print(f"users-readable.csv  ({len(staff)} rows)")

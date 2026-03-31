import express from "express";
import fs from "fs";
import path from "path";

const router = express.Router();

function resolveApkFile(apkPath: string): string | null {
  const resolved = path.resolve(apkPath);

  if (!fs.existsSync(resolved)) return null;

  const stat = fs.statSync(resolved);
  if (stat.isDirectory()) {
    const files = fs.readdirSync(resolved);
    const apkFile = files.find((f) => f.endsWith(".apk"));
    if (!apkFile) return null;
    return path.join(resolved, apkFile);
  }

  return resolved.endsWith(".apk") ? resolved : null;
}

router.get("/apk", (req, res) => {
  const apkPath = process.env.APK_PATH;

  if (!apkPath) {
    res.status(404).json({ message: "APK_PATH 환경변수가 설정되지 않았습니다." });
    return;
  }

  const filePath = resolveApkFile(apkPath);

  if (!filePath) {
    res.status(404).json({ message: "APK 파일을 찾을 수 없습니다.", path: apkPath });
    return;
  }

  const fileName = path.basename(filePath);
  res.setHeader("Content-Type", "application/vnd.android.package-archive");
  res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
  res.sendFile(filePath);
});

export default router;

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { UpdatePolicy } from "./updates";

const exec = promisify(execFile);
export async function verifyPlatformInstaller(file: string, policy: UpdatePolicy): Promise<void> {
  if (process.platform === "darwin") {
    if (!policy.macTeamId || !/^[A-Z0-9]{10}$/.test(policy.macTeamId)) throw new Error("尚未配置 macOS 發布者識別。");
    await exec("/usr/bin/codesign", ["--verify", "--strict", file], { timeout: 30_000 });
    const metadata = await exec("/usr/bin/codesign", ["-d", "--verbose=4", file], { timeout: 30_000 });
    if (!metadata.stderr.split(/\r?\n/).includes(`TeamIdentifier=${policy.macTeamId}`)) throw new Error("macOS 安裝包簽署者不同。");
    await exec("/usr/sbin/spctl", ["--assess", "--type", "open", "--context", "context:primary-signature", file], { timeout: 60_000 });
  } else if (process.platform === "win32") {
    if (!policy.windowsPublisherThumbprints.length) throw new Error("尚未配置 Windows 發布憑證。");
    // File is passed as an environment value, never interpolated into PowerShell code.
    const result = await exec("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
      "$s = Get-AuthenticodeSignature -LiteralPath $env:GGD_VERIFIED_INSTALLER; if ($s.Status -ne 'Valid') { exit 1 }; $s.SignerCertificate.Thumbprint"],
    { timeout: 30_000, env: { ...process.env, GGD_VERIFIED_INSTALLER: file } });
    if (!policy.windowsPublisherThumbprints.map((value) => value.toUpperCase()).includes(result.stdout.trim().toUpperCase())) throw new Error("Windows 安裝包簽署者不同。");
  } else throw new Error("這個平台尚未提供安裝更新。");
}

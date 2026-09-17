import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { realpath } from "node:fs/promises";
import path from "node:path";
const execute = promisify(execFile);
export async function verifyWindowsEndpoint(port) {
  if (process.platform !== "win32") throw new Error("This pilot launcher currently verifies Windows installations only.");
  const script = `$ErrorActionPreference='Stop'; [Console]::OutputEncoding=[Text.Encoding]::UTF8;
    $pkg=Get-AppxPackage -Name OpenAI.Codex | Sort-Object Version -Descending | Select-Object -First 1;
    if (!$pkg) { throw 'Official Codex package not found' };
    $rows=@(Get-NetTCPConnection -State Listen -LocalPort ${port} -ErrorAction Stop | ForEach-Object {
      [pscustomobject]@{ address=$_.LocalAddress; pid=$_.OwningProcess; executable=(Get-Process -Id $_.OwningProcess -ErrorAction Stop).Path }
    });
    [pscustomobject]@{ install=$pkg.InstallLocation; version=$pkg.Version.ToString(); listeners=$rows } | ConvertTo-Json -Depth 4 -Compress`;
  const { stdout } = await execute("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    windowsHide: true, timeout: 15000, maxBuffer: 1024 * 1024,
  });
  const result = JSON.parse(stdout.replace(/^\uFEFF/u, "").trim());
  const expected = (await realpath(path.join(result.install, "app", "ChatGPT.exe"))).toLowerCase();
  if (!result.listeners?.length) throw new Error("No CDP listener.");
  for (const listener of result.listeners) {
    if (!["127.0.0.1", "::1"].includes(listener.address)) throw new Error("CDP listener is exposed beyond loopback.");
    if (!listener.executable || (await realpath(listener.executable)).toLowerCase() !== expected) {
      throw new Error("CDP listener does not belong to the installed Codex executable.");
    }
  }
  return { version: result.version, executable: expected, pids: result.listeners.map(row => row.pid) };
}

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host '需要先安装 Node.js 22.18 或以上版本。建议 Node.js 24 LTS。'
    exit 1
}
$cineNodeVersion = (& node -p 'process.versions.node').Trim().Split('.')
if ([int]$cineNodeVersion[0] -lt 22 -or ([int]$cineNodeVersion[0] -eq 22 -and [int]$cineNodeVersion[1] -lt 18)) {
    Write-Host 'Node.js 版本过旧，请升级到 22.18 或以上版本。'
    exit 1
}
if (-not (Test-Path -LiteralPath '.env')) {
    Copy-Item -LiteralPath '.env.example' -Destination '.env'
    Write-Host '已建立 .env 配置文件。请填写自己的 DEEPSEEK_API_KEY，然后重新运行。'
    Write-Host '自动创作使用 DeepSeek；图像分析工具另外需要 GEMINI_API_KEY。'
    exit 0
}
if (-not (Test-Path -LiteralPath 'node_modules/tsx/dist/cli.mjs')) {
    & npm.cmd ci
    if ($LASTEXITCODE -ne 0) { throw '依赖安装失败，请检查网络后再运行。' }
}
Write-Host 'CinePrompt 正在启动。通常访问 http://localhost:3000；如已修改 PORT，以配置为准。'
Write-Host '首次使用请登录并验证邮箱。退出服务按 Ctrl+C。'
if (-not (Test-Path -LiteralPath 'dist/index.html')) {
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw '构建失败，请检查错误信息。' }
}
& npm.cmd start
exit $LASTEXITCODE

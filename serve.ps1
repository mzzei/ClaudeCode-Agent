$root = "C:\Users\Gabriel\.claude\sessions\WorldCupAgent"
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:3456/")
$listener.Start()
Write-Host "Listening on http://localhost:3456/"
while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $path = $ctx.Request.Url.LocalPath
    if ($path -eq "/" -or $path -eq "") { $path = "/index.html" }
    $file = $root + $path.Replace("/", "\")
    try {
        $bytes = [System.IO.File]::ReadAllBytes($file)
        $ext = [System.IO.Path]::GetExtension($file).ToLower()
        $ctx.Response.ContentType = if ($ext -eq ".html") { "text/html; charset=utf-8" } elseif ($ext -eq ".js") { "application/javascript" } elseif ($ext -eq ".css") { "text/css" } elseif ($ext -eq ".json") { "application/manifest+json" } elseif ($ext -eq ".png") { "image/png" } elseif ($ext -eq ".ico") { "image/x-icon" } else { "application/octet-stream" }
        $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } catch { $ctx.Response.StatusCode = 404 }
    $ctx.Response.Close()
}

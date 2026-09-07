# Generates one WAV per narration scene using the Windows speech synthesizer.
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File tts.ps1 -Json <path> -Out <dir>
param(
    [Parameter(Mandatory = $true)][string]$Json,
    [Parameter(Mandatory = $true)][string]$Out
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Speech

$spec = Get-Content -Raw -Path $Json | ConvertFrom-Json
if (-not (Test-Path $Out)) { New-Item -ItemType Directory -Path $Out -Force | Out-Null }

$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
    $installed = $synth.GetInstalledVoices() | ForEach-Object { $_.VoiceInfo.Name }
    if ($spec.voice -and ($installed -contains $spec.voice)) {
        $synth.SelectVoice($spec.voice)
    }
    else {
        Write-Host "requested voice not installed; using default: $($synth.Voice.Name)"
    }
    if ($null -ne $spec.rate) { $synth.Rate = [int]$spec.rate }

    foreach ($scene in $spec.scenes) {
        $path = Join-Path $Out ($scene.id + ".wav")
        $synth.SetOutputToWaveFile($path)
        # An em dash is spoken as "dash" by SAPI; a comma gives the intended pause.
        $spoken = $scene.text -replace [char]0x2014, ","
        $synth.Speak($spoken)
        Write-Host "wrote $($scene.id).wav"
    }
    $synth.SetOutputToNull()
}
finally {
    $synth.Dispose()
}

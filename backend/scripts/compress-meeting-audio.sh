#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 || $# -gt 2 ]]; then
  echo "Usage: $0 INPUT_AUDIO [OUTPUT_OGG]" >&2
  exit 2
fi

input=$1
if [[ ! -f $input ]]; then
  echo "Input file not found: $input" >&2
  exit 1
fi

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo 'ffmpeg is required' >&2
  exit 1
fi

output=${2:-${input%.*}.transcription-quality.ogg}
if [[ $input == "$output" ]]; then
  echo 'Output path must differ from input path' >&2
  exit 2
fi

# Match the meeting transcription audio settings: mono, 16 kHz, Opus at 32 kbit/s.
ffmpeg -hide_banner -loglevel error -nostdin -n \
  -i "$input" -map 0:a:0 -vn \
  -ac 1 -ar 16000 -c:a libopus -b:a 32k \
  -f ogg "$output"

input_bytes=$(wc -c < "$input" | tr -d ' ')
output_bytes=$(wc -c < "$output" | tr -d ' ')
printf 'Input:  %s (%s bytes)\nOutput: %s (%s bytes)\n' \
  "$input" "$input_bytes" "$output" "$output_bytes"

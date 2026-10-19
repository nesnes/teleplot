#!/usr/bin/env bash
set -euo pipefail

# Concatenate all JavaScript files in `src/` that begin with a 3-digit
# numeric prefix followed by a dash (e.g. 001-foo.js) into a single
# teleplot-js.js file. Files are ordered by the numeric prefix.

shopt -s nullglob
out="teleplot-js.js"
> "$out"

files=( src/[0-9][0-9][0-9]-*.js )
if [ ${#files[@]} -eq 0 ]; then
	echo "No matching files found."
	exit 1
fi

# Sort by the numeric prefix before the first dash
IFS=$'\n' sorted=( $(for f in "${files[@]}"; do echo "$f"; done | sort -t- -k1,1n) )

for f in "${sorted[@]}"; do
	printf "\n/* %s */\n" "$f" >> "$out"
	cat "$f" >> "$out"
done

echo "Wrote $out (concatenated ${#sorted[@]} files)."
cp "$out" ../webapp/libs/

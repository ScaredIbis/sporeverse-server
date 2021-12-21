#!/bin/bash

mkdir -p ./output
rm -r ./output/*

for filename in ./src/*.yaml; do
  ytt -f "$filename" -f "$1" >> "./output/$(basename "$filename" .yaml).yaml"
done
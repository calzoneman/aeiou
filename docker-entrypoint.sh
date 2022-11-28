#!/bin/sh

mkdir -p /files/rendered /files/tmp
wine winver || true
exec "$@"

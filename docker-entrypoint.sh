#!/bin/sh

wine winver || true
exec "$@"

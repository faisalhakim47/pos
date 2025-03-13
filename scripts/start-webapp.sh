#!/usr/bin/env bash

set -eux

SCRIPT_PATH=$(realpath "${BASH_SOURCE[0]}")
SCRIPTS_DIR=$(dirname "$SCRIPT_PATH")
WORKING_DIR=$(dirname "$SCRIPTS_DIR")

rm -rf "$WORKING_DIR"/.local/nginx
mkdir -p "$WORKING_DIR"/.local/nginx

export HTTP_PORT="${HTTP_PORT:-4000}"

cat <<EOF >> "$WORKING_DIR"/.local/nginx/nginx.conf
daemon off;
worker_processes 2;

pid $WORKING_DIR/.local/nginx/nginx.pid;
error_log $WORKING_DIR/.local/nginx/nginx-error.log;

events {
  worker_connections 1024;
}

http {
  error_log $WORKING_DIR/.local/nginx/nginx-error.log;
  access_log $WORKING_DIR/.local/nginx/nginx-access.log;

  client_body_temp_path $WORKING_DIR/.local/nginx/client-body;
  fastcgi_temp_path $WORKING_DIR/.local/nginx/fastcgi;
  proxy_temp_path $WORKING_DIR/.local/nginx/proxy;
  scgi_temp_path $WORKING_DIR/.local/nginx/scgi;
  uwsgi_temp_path $WORKING_DIR/.local/nginx/uwsgi;

  types {
    text/html                             html htm shtml;
    text/css                              css;
    text/xml                              xml;
    image/jpeg                            jpeg jpg;
    application/javascript                js mjs;
    application/atom+xml                  atom;
    application/rss+xml                   rss;
    application/wasm                      wasm;
    text/plain                            txt;
    image/png                             png;
    image/x-icon                          ico;
    image/svg+xml                         svg svgz;
    image/webp                            webp;
    font/woff2                            woff2;
    application/font-woff                 woff;
    application/json                      json;
    application/rtf                       rtf;
    application/x-7z-compressed           7z;
    audio/midi                            mid midi kar;
    audio/mpeg                            mp3;
    audio/ogg                             ogg;
    audio/x-m4a                           m4a;
  }

  server {
    listen $HTTP_PORT;
    location / {
      etag on;
      add_header Cache-Control 'public,must-revalidate,max-age=5,s-maxage=5';
      root $WORKING_DIR;
      try_files \$uri \$uri/ /index.html;
    }
  }
}
EOF

nginx \
  -p "$WORKING_DIR"/.local/nginx/ \
  -e "$WORKING_DIR"/.local/nginx/error.log \
  -c "$WORKING_DIR"/.local/nginx/nginx.conf

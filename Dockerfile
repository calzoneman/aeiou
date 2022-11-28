FROM --platform=linux/386 i386/alpine:3.17

RUN apk add --no-cache bash git nodejs npm pulseaudio wine xvfb

COPY ./docker-xvfb-run /usr/local/bin/xvfb-run

RUN adduser --home /var/lib/aeiou --system --uid=1000 --shell /bin/bash aeiou
RUN mkdir -p /files /logs /var/lib/aeiou/aeiou /wineprefix && \
  chown aeiou:nogroup /files /logs /var/lib/aeiou/aeiou /wineprefix
USER aeiou

RUN touch /logs/aeiou.log /logs/ttsrequests.ndjson
RUN ln -s /logs/aeiou.log /var/lib/aeiou/aeiou/aeiou.log
RUN ln -s /logs/ttsrequests.ndjson /var/lib/aeiou/aeiou/ttsrequests.ndjson

COPY --chown=aeiou:nogroup ./lib /var/lib/aeiou/aeiou/lib/
COPY --chown=aeiou:nogroup ./index.html /var/lib/aeiou/aeiou/
COPY --chown=aeiou:nogroup ./index.js /var/lib/aeiou/aeiou/
COPY --chown=aeiou:nogroup ./package.json /var/lib/aeiou/aeiou/
COPY --chown=aeiou:nogroup ./package-lock.json /var/lib/aeiou/aeiou/
COPY --chown=aeiou:nogroup ./docker-config.js /var/lib/aeiou/aeiou/config.js
COPY --chown=aeiou:nogroup ./docker-entrypoint.sh /var/lib/aeiou/entrypoint.sh

WORKDIR /var/lib/aeiou/aeiou
RUN npm install

ENV WINEPREFIX=/wineprefix WINEARCH=win32 WINEDEBUG=-all
ENV AEIOU_MAX_LENGTH=1024 AEIOU_MAX_PROCS=3 AEIOU_MAX_QUEUE_DEPTH=30
ENV DISPLAY=:0 XAUTHORITY=/var/lib/aeiou/.Xauthority

VOLUME /files /logs /wineprefix
EXPOSE 8080

ENTRYPOINT ["/var/lib/aeiou/entrypoint.sh"]
CMD ["/usr/bin/node", "index.js"]

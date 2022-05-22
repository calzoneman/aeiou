FROM --platform=linux/386 i386/alpine:3.15

RUN apk add --no-cache bash git nodejs npm pulseaudio wine xvfb

ADD https://raw.githubusercontent.com/monokrome/docker-wine/master/bin/xvfb-run /usr/local/bin/xvfb-run
RUN chmod a+rx /usr/local/bin/xvfb-run

RUN adduser --home /var/lib/aeiou --system --shell /bin/bash aeiou
RUN mkdir /files /logs && chown aeiou:nogroup /files /logs
USER aeiou

RUN git clone https://github.com/calzoneman/aeiou /var/lib/aeiou/aeiou
WORKDIR /var/lib/aeiou/aeiou
RUN npm install

COPY --chown=aeiou:nogroup wineprefix /var/lib/aeiou/wineprefix
COPY --chown=aeiou:nogroup decwav.exe /var/lib/aeiou/aeiou/
COPY --chown=aeiou:nogroup config.js /var/lib/aeiou/aeiou/

RUN touch /logs/aeiou.log /logs/ttsrequests.ndjson
RUN ln -s /logs/aeiou.log /var/lib/aeiou/aeiou/aeiou.log
RUN ln -s /logs/ttsrequests.ndjson /var/lib/aeiou/aeiou/ttsrequests.ndjson

ENV WINEPREFIX=/var/lib/aeiou/wineprefix WINEARCH=win32 WINEDEBUG=-all
# Force wine to rebuild its configuration at image build time to avoid slow starts
RUN wine winver || true

VOLUME /files /logs
EXPOSE 8080

CMD ["/usr/bin/node", "index.js"]

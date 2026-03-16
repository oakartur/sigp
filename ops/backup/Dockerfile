FROM postgres:15-alpine

RUN apk add --no-cache bash coreutils findutils tzdata

WORKDIR /opt/sigp-backup

COPY scripts/ /opt/sigp-backup/scripts/
COPY crontab /etc/crontabs/root

RUN chmod +x /opt/sigp-backup/scripts/*.sh

CMD ["/opt/sigp-backup/scripts/run.sh"]

# kids-psn: the PlayStation Family bridge (server.py). Built and started by ../../deploy.sh.
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY server.py ./
ENV PSN_DATA_DIR=/data PORT=8090 PYTHONUNBUFFERED=1
RUN useradd --uid 10001 --no-create-home psn && mkdir -p /data && chown psn /data
USER psn
EXPOSE 8090
CMD ["python", "server.py"]

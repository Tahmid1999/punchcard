FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
# The models are fetched at build time and checked against the pinned hashes,
# so a running container never reaches the internet.
COPY fetch_models.py ./
RUN python fetch_models.py /app/models
COPY faces.py app.py ./
ENV MODELS_DIR=/app/models
EXPOSE 3201
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "3201"]

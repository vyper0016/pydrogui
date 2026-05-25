FROM node:20-slim AS frontend-build

WORKDIR /frontend
COPY frontend-pydrogui/package.json frontend-pydrogui/package-lock.json ./
RUN npm ci
COPY frontend-pydrogui/ ./
RUN npm run build


FROM python:3.14-slim

WORKDIR /app

ADD pypy-pydrofoil-scripting-experimental.tar.bz2 /pypy
COPY app/requirements.txt /app/requirements.txt

RUN apt update \
	&& apt install -y --no-install-recommends binutils-riscv64-linux-gnu

RUN /pypy/pypy-pydrofoil-scripting-experimental/bin/pypy -m ensurepip --default-pip \
	&& /pypy/pypy-pydrofoil-scripting-experimental/bin/pypy -m pip install --upgrade pip \
	&& /pypy/pypy-pydrofoil-scripting-experimental/bin/pypy -m pip install -r /app/requirements.txt

COPY --from=frontend-build /frontend/dist /frontend-dist

CMD ["/pypy/pypy-pydrofoil-scripting-experimental/bin/pypy", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]


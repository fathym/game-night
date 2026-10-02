FROM denoland/deno:2.6.1
WORKDIR /app
COPY . .
EXPOSE 8420/tcp 8421/udp
CMD ["deno", "run", "--allow-net", "--allow-read", "--allow-write", "--allow-env", "--unstable-net", "main.ts"]

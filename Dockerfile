# Multi-stage build: the Vite client is compiled into the ASP.NET Core app's wwwroot, then published.

FROM node:22-alpine AS client
WORKDIR /src/src/TD.Client
COPY src/TD.Client/package.json src/TD.Client/package-lock.json ./
RUN npm ci
COPY src/TD.Client/ ./
# Vite writes to ../TD.Application/wwwroot.
RUN npm run build

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS server
WORKDIR /src
COPY TD.slnx ./
COPY src/TD.Application/ src/TD.Application/
COPY --from=client /src/src/TD.Application/wwwroot src/TD.Application/wwwroot
RUN dotnet publish src/TD.Application/TD.Application.csproj -c Release -o /app --nologo

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=server /app ./
ENV ASPNETCORE_URLS=http://+:8080 \
    ASPNETCORE_ENVIRONMENT=Production
EXPOSE 8080
USER $APP_UID
ENTRYPOINT ["dotnet", "TD.Application.dll"]

#!/bin/bash

# Script de emergência para resolver problemas com ADB e Maestro
# Autor: Sistema de Testes Foxbit

echo "🚨 Script de Emergência - Resolvendo problemas ADB/Maestro"
echo "=================================================="

# 1. Parar todos os processos relacionados
echo "📱 1. Parando processos Maestro e ADB..."
pkill -f maestro || true
pkill -f "maestro.cli.AppKt" || true
pkill -f adb || true
sleep 2

# 2. Verificar se há processos travados
echo "🔍 2. Verificando processos travados..."
if pgrep -f maestro > /dev/null || pgrep -f "maestro.cli.AppKt" > /dev/null; then
    echo "⚠️  Processos Maestro encontrados - forçando encerramento..."
    pkill -9 -f maestro || true
    pkill -9 -f "maestro.cli.AppKt" || true
fi

if pgrep -f adb > /dev/null; then
    echo "⚠️  Processos ADB encontrados - forçando encerramento..."
    pkill -9 -f adb || true
fi

sleep 2

# 3. Limpar sockets e portas TCP
echo "🧹 3. Limpando sockets e portas..."
# Limpar possíveis sockets travados
rm -rf /tmp/.adb* || true
rm -rf ~/.android/adbkey* || true

# 4. Reiniciar ADB do zero
echo "🔄 4. Reiniciando ADB..."
echo "   - Matando servidor ADB..."
adb kill-server 2>/dev/null || true
sleep 3

echo "   - Iniciando novo servidor ADB..."
adb start-server
sleep 3

# 5. Verificar dispositivos
echo "📱 5. Verificando dispositivos conectados..."
echo "   Dispositivos encontrados:"
adb devices -l

# 6. Testar conexão básica
echo "🔎 6. Testando conexão com dispositivo..."
if adb shell echo "teste" > /dev/null 2>&1; then
    echo "✅ Conexão com dispositivo funcionando!"
else
    echo "❌ Problema na conexão com dispositivo"
    echo "   Possíveis soluções:"
    echo "   - Desconecte e reconecte o cabo USB"
    echo "   - Verifique se a depuração USB está ativada"
    echo "   - Reinicie o dispositivo"
fi

# 7. Limpar cache do Maestro
echo "🧽 7. Limpando cache do Maestro..."
rm -rf ~/.maestro/cache/* || true

echo ""
echo "✅ Processo de emergência concluído!"
echo "📋 Tente executar seu teste novamente:"
echo "   maestro test <arquivo.yaml>"
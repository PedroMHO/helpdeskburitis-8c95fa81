# Plano: HelpDesk Buritis Desktop Offline para Windows

## Objetivo
Criar uma edição desktop instalável do HelpDesk Buritis que funcione sem internet, mantenha os dados e fotos no próprio computador e preserve os fluxos descritos no contexto atual.

## Entrega
- Aplicativo Electron para Windows, com janela segura e assets locais.
- Banco SQLite interno criado automaticamente no primeiro uso.
- Tela de configuração inicial para cadastrar o primeiro administrador.
- Login local por e-mail e senha protegida.
- Chamados, solicitações, usuários, localidades, histórico, manutenção, notificações e permissões funcionando localmente.
- Fotos copiadas para a pasta de dados do aplicativo.
- Exportação/importação ZIP e limpeza de histórico adaptadas ao banco local.
- Pacote Windows x64 compactado para download, contendo o executável `.exe` portátil.

## Implementação
1. Criar a camada Electron (`main.cjs` e `preload.cjs`) com isolamento de contexto, IPC validado e diretório persistente do usuário.
2. Criar e versionar o schema SQLite, dados iniciais mínimos e transações para regras críticas, incluindo encerramento concorrente e limite de chamado ativo por setor.
3. Implementar autenticação e cargos locais, mantendo cargos separados dos perfis e aplicando autorização no processo principal.
4. Substituir, apenas na edição desktop, as chamadas do backend remoto por uma API local compatível com as telas existentes.
5. Adaptar fotos, notificações, exportação/importação e relatórios para arquivos e dados locais.
6. Configurar o build estático com caminhos relativos e scripts de empacotamento Windows.
7. Validar o primeiro acesso, criação e movimentação de chamado, persistência após reinício e geração do pacote.

## Decisões técnicas
- O aplicativo web publicado continuará usando o backend atual sem alterações de comportamento.
- A edição desktop será selecionada durante o build por uma variável própria, evitando misturar banco local com a versão online.
- O pacote gerado neste ambiente será Windows x64 em `.zip`, com o `.exe` executável dentro. Não será um instalador assistido `.msi`/Setup, pois esse formato exige ferramentas de empacotamento não disponíveis aqui.
- O banco e as fotos ficarão na pasta de dados do usuário do Windows, não dentro da pasta do programa, para sobreviver a atualizações.

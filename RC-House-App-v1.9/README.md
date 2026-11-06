# RC House Espaço de Eventos — Agenda & Contratos (PWA)

App web instalável (PWA, mobile-first) para gerir as reservas do salão e gerar automaticamente o
**Contrato Universal de Locação Temporária por Diária** em **folha única A4 (PDF)**.

## Como abrir

| Onde | Como |
|---|---|
| **Teste rápido no PC** | Clique duas vezes em `index.html`. Tudo funciona, exceto a instalação como app e o modo offline. Para isso é preciso abrir o app a partir de um endereço `https://`. |
| **Servidor local** | Na pasta, execute `npx serve .` (ou `python -m http.server`) e abra `http://localhost:3000` (ou a porta que o comando mostrar). |
| **Vercel** | Entre em vercel.com → *Add New → Project* → importe a pasta (ou o repositório GitHub). **Framework: Other**, sem comando de build. O `vercel.json` já configura o cache do Service Worker. |
| **Netlify** | Arraste a pasta inteira para app.netlify.com/drop. |

Depois de publicado, abra o link no **Chrome do Android**. Aparece o pop-up **“📲 Instalar App RC House”**
com o botão **“Criar Atalho Agora”**. Se o pop-up for fechado, o botão **Instalar** continua disponível na
barra superior, na barra lateral e em **Ajustes**.

## Fluxo

1. **Ajustes** → ligue a **Planilha Google** (ver abaixo) e preencha CPF da locadora, telefone, chave Pix, taxa por hora excedente e o valor padrão da diária (opcional).
2. **Agenda** → toque num dia livre → **Agendar nesta data**. A data da locação já vem preenchida.
3. Preencha o formulário. CPF, telefone e valores em R$ têm máscara automática, e o saldo é calculado sozinho (Total − Sinal), mas pode ser editado.
4. **Salvar e Gerar Contrato** → o agendamento fica 🟡 *Aguardando Assinatura* e o contrato A4 abre:
   - **Baixar PDF**
   - **Enviar WhatsApp**: no Android anexa o PDF via partilha nativa; no PC baixa o PDF e abre o `wa.me` do cliente com a mensagem pronta.
5. Quando o cliente devolver o contrato assinado → abra a reserva → **✅ Marcar como "Contrato Assinado"** → o dia fica 🟢 verde.

## Contrato assinado pelo locatário via link (WhatsApp)

A administradora prepara a reserva; o locatário preenche os dados, lê o contrato (já assinado pela RC House),
assina com o dedo no celular, confere o contrato assinado e confirma. O contrato assinado volta sozinho para o app.

1. **Ajustes → Sua assinatura**: desenhe a sua assinatura uma vez (também é pedida automaticamente no primeiro link).
   Preencha também o **CPF da locadora** e a **taxa por hora excedente**, que aparecem no contrato.
2. **Novo Agendamento** → *Quem preenche os dados do locatário?* → **O locatário, por link**. Preencha data, horários,
   evento e valores (o nome do locatário é opcional) → **Salvar e gerar link** → **Copiar link** ou **WhatsApp**.
3. O locatário abre o link (`preencher.html#t=…`) e segue 4 etapas: **Dados** (nome, CPF, RG, telefone, com validação)
   → **Contrato** (lê o contrato com os dados dele e a sua assinatura; botão *Ampliar*) → **Assinar** (quadro grande para
   assinar com o dedo + "Li e concordo") → **Confirmar** (vê o contrato com as duas assinaturas e confirma).
   No fim pode **baixar o PDF** do contrato assinado; abrindo o link de novo, vê o contrato assinado.
4. No app aparece *"<nome> assinou o contrato ✅"*; a reserva fica **Confirmada**, com a assinatura, os dados e o
   contrato assinado (**Ver contrato**, **Baixar PDF**). A data do contrato passa a ser a data da assinatura.

- **Prova da assinatura**: no contrato, abaixo da assinatura do locatário, ficam a data e hora, o CPF e um
  **código de verificação** (resumo SHA-256 do conteúdo do contrato + assinatura). Na planilha ficam também o aparelho/navegador usado.
  É uma assinatura eletrônica simples, aceita entre as partes (MP 2.200-2/2001, art. 10 § 2º); não é certificado ICP-Brasil.
- **Alterar um contrato já assinado** (datas, valores, dados das partes): o app avisa, remove a assinatura e gera um
  novo link para assinar a versão nova. Alterações que não mudam o contrato (ex.: registar pagamento) mantêm a assinatura.
- **Gerar novo link** invalida o anterior; **Cancelar link** encerra o pedido. Reservas antigas sem CPF/RG/telefone
  mostram **Pedir os dados ao locatário por link**. O fluxo manual (*Eu preencho agora* + contrato impresso/WhatsApp) continua igual.
- Segurança: cada link tem um código aleatório de 192 bits que só abre aquela reserva; ele fica depois do `#` do
  endereço (não vai para servidores). A página não vê outras reservas, não altera o que a RC House preencheu, e depois
  de assinado o link não aceita outra assinatura. A planilha valida tudo de novo; o app de gestão nunca consegue criar
  ou trocar a assinatura do locatário.
- Na planilha: *Preenchimento do locatário*, *Link enviado em*, *Assinado pelo locatário em*, *Código de verificação*,
  *Dispositivo da assinatura* e as colunas escondidas *Token do link* e *Assinatura do locatário (imagem)*;
  na aba Ajustes, *Assinatura da locadora (imagem)*.
- **Endereço do site:** os links usam o endereço onde o app está aberto (abra pelo endereço da Vercel) ou o `siteUrl` de `js/config.js`.

## Pagamentos do saldo

Quando o cliente paga o restante (ou parte dele), abra a reserva e toque em **Registrar pagamento**.
Informe o valor (vem preenchido com o que falta), a data e a forma (Pix, dinheiro, cartão ou transferência).
O pagamento fica registrado só no app: **o contrato não muda** e continua mostrando os valores combinados.

- **Total recebido** = sinal (pago no ato) + pagamentos registrados. O sinal nunca é contado duas vezes.
- **Saldo a receber** = saldo restante do contrato − pagamentos registrados.
- Quando não falta nada, a reserva mostra **100% pago** e **Saldo quitado — nada a receber**.
- Um pagamento lançado por engano pode ser apagado (com confirmação).

### Indicadores do painel
**Recebido** e **A receber** somam as reservas cujo **evento** cai no mês exibido no calendário, e não os
pagamentos feitos nesse mês. Reservas canceladas não entram. O app não tem registro de estornos, por isso o
sinal retido de uma reserva cancelada também não aparece em "Recebido".

## Reservas: lista e filtro
- Lista em linhas: nº e cliente, evento, data e horário, situação, valor total e pagamento. No celular vira cartões compactos.
- Uma linha de filtro, com contagem em cada opção: **Próximas** (padrão), **Aguardando**, **A receber**, **Realizadas**, **Canceladas**, **Todas**.
- A busca encontra por nº da reserva, nome, CPF, telefone ou evento.

## Estrutura

```
index.html              Estrutura do app (sidebar desktop, bottom nav mobile)
manifest.json           Manifesto PWA (standalone, portrait, #0D0D10, ícones RC House)
sw.js                   Service Worker (offline + cache)
vercel.json             Cabeçalhos para hospedagem na Vercel
css/app.css             Tailwind CSS compilado (não editar à mão)
css/contract.css        Estilo da folha A4 do contrato
src/input.css           Fonte do Tailwind + componentes do design system
tailwind.config.js      Cores, fontes e sombras da marca
js/utils.js             Máscaras (CPF, telefone, R$), datas por extenso
js/store.js             Dados: cópia local (offline) + fila de alterações para a planilha
js/sync.js              Sincronização com a Planilha Google
preencher.html          Página pública do locatário (link do WhatsApp)
js/preencher.js         Página do locatário: dados → contrato → assinar → confirmar → PDF
js/signature-pad.js     Quadro de assinatura (dedo, caneta ou rato)
js/config.js            URL fixo da planilha (e senha opcional)
apps-script/Codigo.gs   Script para colar na planilha (Extensões → Apps Script)
js/contract.js          Texto oficial do contrato + geração do PDF (html2canvas + jsPDF)
js/app.js               Interface: agenda, reservas, formulário, ajustes, instalação
js/icons.js             Ícones Lucide embutidos (funcionam offline)
js/logo-data.js         Logo embutida (garante a logo no PDF)
vendor/                 html2canvas 1.4.1 e jsPDF 2.5.2 (locais, sem depender de CDN)
assets/brand/           Logo original (WhatsApp Image 2026-10-28 at 12.41.40.jpeg) + recorte circular
assets/icons/           Ícones PWA 192/512, maskable, apple-touch, favicon
assets/img/             Fotos do espaço otimizadas (+ thumbs/)
assets/fonts/           Plus Jakarta Sans e Playfair Display (auto-hospedadas)
```

### Onde cada foto aparece
- Logo RC House: barra lateral, barra superior do celular, pop-up de instalação e cabeçalho do contrato
- `IMG_0317` (piscina com cascata): faixa no topo do formulário Novo Agendamento
- `IMG_0319`, `IMG_0338`, `IMG_0334`: miniaturas alternadas nos cards de reserva

### Layout
- **Desktop:** o Painel & Agenda cabe na área visível, com o calendário centrado (cabeçalho, indicadores, mês completo e legenda, inclusive em meses com 6 semanas).
- **Painel de detalhes (desktop ≥ 1280 px):** fechado por padrão. Abre ao clicar numa reserva (lista ou calendário) e fecha no botão **Fechar** ou ao mudar de tela. Fechado, não ocupa espaço.
- **Celular e telas menores:** os detalhes abrem numa vista própria com **Voltar**.
- **Calendário:**
  - dia com 1 reserva → abre os detalhes;
  - dia com várias reservas → menu para escolher qual abrir;
  - dia livre → menu com **Agendar nesta data** (abre o formulário com a data preenchida).
- **Celular / telas baixas / zoom alto:** a página rola normalmente.
- **Novo agendamento:** fica no menu lateral (desktop) e no botão central da barra inferior (celular).

## Alterar o visual

Edite as classes em `index.html` / `js/*.js` ou os componentes em `src/input.css` e recompile:

```bash
npm install
npm run build:css
```

Ao publicar uma nova versão, aumente `VERSION` em `sw.js` para os celulares receberem a atualização.

## Banco de dados na Planilha Google (Google Sheets)

O app grava primeiro no aparelho (funciona sem internet) e sincroniza com uma planilha do Google:
ao salvar qualquer coisa, ao abrir o app, ao voltar a internet e a cada minuto com o app aberto.
Assim a agenda fica igual no celular e no PC, e dá para ver e editar tudo direto na planilha.

### Planilha já configurada no app (como está agora)

O endereço da planilha está fixo em **`js/config.js`** (`planilhaUrl`). Quem abrir o site na Vercel vê uma tela
**Senha de acesso** só na primeira vez em cada aparelho. A senha é a `CHAVE_DE_ACESSO` do script. Depois disso, o app
abre sempre direto e ligado à planilha.

- **Trocar a senha:** mude a `CHAVE_DE_ACESSO` no Apps Script e publique uma nova versão da implantação. Cada aparelho
  volta a pedir a senha (sem perder o que tinha guardado).
- **Sem senha nenhuma:** preencha `chave` em `js/config.js`. Atenção: aí qualquer pessoa com o link do site
  vê e altera as reservas (nomes, CPF, telefones).
- **Ajustes → Planilha Google → Sair deste aparelho:** apaga a cópia local e pede a senha de novo (útil num aparelho emprestado).
- **Trocar de planilha:** cole o novo URL `/exec` em `js/config.js` e publique de novo. Para voltar ao modo em que cada aparelho
  cola o URL em Ajustes, deixe `planilhaUrl: ''`.

### Configurar uma planilha nova (uma vez, ~5 minutos, no computador)

1. Crie uma planilha nova em **sheets.google.com** (dê um nome, ex.: *RC House — Banco de dados*).
2. Menu **Extensões → Apps Script**. Apague o código que aparece e cole todo o conteúdo de
   `apps-script/Codigo.gs` (em **Ajustes → Planilha Google → Como criar a planilha** há um botão que copia o código).
3. Na linha `const CHAVE_DE_ACESSO = 'troque-esta-chave';` troque `troque-esta-chave` por uma senha sua
   (8 caracteres ou mais). Clique em **Salvar** (ícone de disquete).
4. **Implantar → Nova implantação** → engrenagem → **App da Web**.
   - Executar como: **Eu**
   - Quem pode acessar: **Qualquer pessoa**
   → **Implantar** → **Autorizar acesso** (escolha a sua conta; se aparecer "app não verificado",
   clique em *Avançado → Acessar*). Copie o **URL do app da Web** (termina em `/exec`).
5. No app: **Ajustes → Planilha Google** → cole o URL e a chave → **Conectar planilha**.
   As reservas que já estão no aparelho são enviadas e as abas são criadas sozinhas.
6. Repita só o passo 5 em cada aparelho (celular, PC) com o mesmo URL e a mesma chave.

> A chave protege os dados (CPF, telefones). Não partilhe o URL e a chave com quem não deve ver a agenda.
> Se mudar o código do script depois: **Implantar → Gerenciar implantações → lápis → Versão: Nova versão**
> (assim o URL continua o mesmo).

### Velocidade
- Depois do primeiro login, o app abre **na hora** com a cópia guardada no aparelho; a conversa com a planilha
  acontece em segundo plano (o indicador mostra "Sincronizando…").
- O Google "adormece" o script quando ninguém o usa; a primeira chamada depois disso demora 2–5 s.
  Para evitar: no Apps Script, **Acionadores → Adicionar acionador** → função `manterAcordado`,
  *Baseado no tempo*, *Contador de minutos*, *A cada 10 minutos*.
- O login faz uma só chamada ao Google e as bibliotecas de PDF só carregam ao abrir um contrato.

### Abas da planilha

| Aba | Conteúdo |
|---|---|
| **Reservas** | Uma linha por reserva: situação, data, horários, evento, cliente (nome, CPF, RG, telefone), valores em R$, Pix, locadora, assinatura e datas de criação/assinatura/cancelamento. |
| **Pagamentos** | Uma linha por pagamento do saldo, ligada à reserva pela coluna *ID da reserva*. |
| **Ajustes** | Os padrões do contrato (os mesmos de **Ajustes** no app). |

- **Pago após o sinal**, **Falta receber** (Reservas) e **Cliente**, **Data do evento** (Pagamentos) são fórmulas automáticas.
- Pode editar qualquer célula, ordenar e filtrar. O app recebe as mudanças em até 1 minuto
  (ou na hora, em **Ajustes → Sincronizar**). A coluna *Atualizado em* muda sozinha quando edita uma linha.
- **Criar reserva direto na planilha:** preencha numa linha nova pelo menos *Data do evento* e *Cliente*
  (o resto vem dos Ajustes). O ID é gerado na próxima sincronização. Linhas incompletas ficam como estão até serem completadas.
- **Situação** aceita *Aguardando assinatura*, *Confirmado* ou *Cancelado* (lista na célula).
- Pode acrescentar colunas suas (ex.: *Observações*) à direita: o app não mexe nelas.
- **ID** é um número (1, 2, 3…) dado pela planilha. Em **Pagamentos**, **ID da reserva** é esse número: para lançar um pagamento à mão, escreva o número da reserva. A coluna escondida **Código interno** é usada pelo app para reconhecer cada reserva entre aparelhos — não altere nem apague. Não altere as colunas **ID** e **ID da reserva**. Para apagar uma reserva, use o app (ou apague a linha inteira na planilha).
- Se a mesma reserva for alterada em dois sítios ao mesmo tempo, fica a versão alterada por último (a reserva inteira).

### Indicador de sincronização
Na barra lateral (PC) e no topo (celular): 🟢 sincronizado · 🟡 alterações por enviar / offline · 🔴 erro
(toque para ver o motivo em Ajustes). **Desligar** em Ajustes faz o aparelho deixar de sincronizar sem apagar nada.

### Onde ficam os dados
A **planilha é o banco de dados**. Cada aparelho guarda só uma cópia para funcionar sem internet; ao entrar com a
senha num aparelho novo, a agenda vem toda da planilha. Para ter uma cópia de segurança, use o histórico de versões
do próprio Google Sheets (**Arquivo → Histórico de versões**) ou **Arquivo → Fazer uma cópia** de vez em quando.

Os valores monetários são guardados no app em **centavos** (inteiros) e na planilha em **reais**.

## Novidades da versão 1.6 (revisão)

- Banco de dados na Planilha Google, com fila offline e sincronização entre aparelhos.
- Corrigido: depois de salvar um agendamento no PC, o painel da reserva não ficava aberto ao voltar do contrato.
- Corrigido: salvar o formulário de edição podia desfazer um pagamento registado noutro aparelho ou aba
  enquanto o formulário estava aberto (o formulário já não sobrescreve os pagamentos).
- Corrigido: reservas incompletas (sem cliente, valores…) podiam travar a lista; agora os campos que faltam são preenchidos.
- Corrigido: fechar um diálogo com **Esc** deixava o diálogo de pagamento "preso" ao próximo clique.
- Textos de excluir/apagar dados ajustados para deixar claro o que acontece com a planilha.
- Planilha fixa no app (`js/config.js`): cada aparelho só digita a senha uma vez.
- v1.7: o app começa do zero e usa só a planilha. Saiu o exportar/importar JSON; os dados de teste
  guardados nos navegadores pelas versões anteriores são apagados ao abrir a nova versão.
- v1.9: o locatário preenche os dados e assina o contrato pelo link (página `preencher.html`); assinatura da locadora em Ajustes.
- Ao publicar: o `sw.js` já está na versão `rc-house-v1.9.0`.

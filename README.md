# 🏛️ RC House – Gestão de Eventos, PWA & Gerador de Contratos

Aplicação Web Progressiva (PWA) desenvolvida à medida para a gestão operacional de agendamentos, geração instantânea de contratos de locação em formato A4 com recolha de assinatura digital e sincronização bidirecional em tempo real.

🔗 **Demonstração online:** [https://rchousegestao.vercel.app](https://rchousegestao.vercel.app)

---

## 💡 O Desafio & A Solução

* **Problema:** A gestão manual de datas e a elaboração manual de contratos físicos gerava atritos, riscos de sobreposição de reservas e perda de tempo na recolha de assinaturas.
* **Solução:** Um sistema autónomo, utilizável tanto em desktop como em dispositivos móveis, capaz de emitir contratos formatados para impressão/PDF, colher assinaturas digitais no ecrã e manter uma base centralizada de eventos sem custos de servidores dedicados.

---

## 🚀 Principais Funcionalidades

* 📱 **PWA (Progressive Web App):** Instalável no telemóvel e com suporte para funcionamento offline via Service Worker.
* 📄 **Gerador de Contratos A4:** Renderização e exportação direta de termos contratuais para PDF estruturado.
* ✍️ **Recolha de Assinatura Digital:** Módulo interativo com tela canvas para assinatura direta do contratante.
* 🔄 **Sincronização em Nuvem:** Integração com Google Sheets através de Google Apps Script atuando como API sem custos fixos de infraestrutura.
* 🎨 **Design Responsivo & Otimizado:** Interface moderna construída com Tailwind CSS e tipografia cuidada.

---

## 🛠️ Tecnologias Utilizadas

* **Frontend:** HTML5 Semântico, CSS3, JavaScript (ES6+ Vanilla Modular).
* **Estilização:** Tailwind CSS (compilação e minificação automatizada).
* **Bibliotecas Client-Side:** jsPDF, html2canvas, Signature Pad.
* **Backend Serverless:** Google Apps Script (REST/JSON API) + Google Sheets.
* **Alojamento & CI/CD:** Vercel.

---

## 💻 Como Executar Localmente

```bash
# Clonar o repositório
git clone [https://github.com/SEU_UTILIZADOR/rc-house-agenda.git](https://github.com/SEU_UTILIZADOR/rc-house-agenda.git)
cd rc-house-agenda

# Instalar dependências de estilização
npm install

# Compilar o CSS via Tailwind
npm run build:css

# Iniciar o servidor de desenvolvimento local
npm start

/* =========================================================================
   RC House — Configuração fixa (vale para todas as pessoas que abrirem o site)
   ========================================================================= */
window.RC_CONFIG = {
  /* URL da implantação do Apps Script (Implantar → Gerenciar implantações → App da Web) */
  planilhaUrl: 'https://script.google.com/macros/s/AKfycbyZHxFzOtKzQO9_3MYD4x1uOwUjkt9wfSD-Acs7_U5hS4aQX69ClQODY_ZSSsSEyoGI/exec',

  /* Endereço público do site (o da Vercel), usado nos links enviados ao locatário pelo WhatsApp.
     Ex.: 'https://rc-house.vercel.app'. Vazio → usa o endereço onde o app está aberto
     (não funciona se o app for aberto direto do arquivo no computador). */
  siteUrl: '',

  /* Senha (a CHAVE_DE_ACESSO do script).
     Vazio  → o app pede a senha uma única vez em cada aparelho (recomendado).
     Preenchida → ninguém precisa digitar nada, MAS qualquer pessoa que tenha o link
     do site consegue ver e alterar as reservas (nomes, CPF, telefones). */
  chave: ''
};

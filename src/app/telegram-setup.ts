import { Injectable } from '@angular/core';
import { findGroupIds } from './setup-progress';

@Injectable({ providedIn: 'root' })
export class TelegramSetup {
  private async request(token: string, method: string): Promise<any> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
        method: 'POST', signal: controller.signal,
      });
      const data = await response.json();
      if (response.status === 401 || response.status === 404) throw new Error('Token non riconosciuto. Copia il token completo dal messaggio di BotFather.');
      if (response.status === 409) throw new Error('Un altro servizio sta ricevendo i messaggi di questo bot. Mettilo in pausa oppure inserisci il codice del gruppo manualmente.');
      if (!response.ok || data.ok !== true) throw new Error('Telegram non riesce a completare la ricerca. Riprova tra poco.');
      return data;
    } catch (error) {
      if (error instanceof TypeError || (error instanceof Error && error.name === 'AbortError'))
        throw new Error('Non riesco a raggiungere Telegram. Controlla la connessione e riprova.');
      throw error;
    } finally { clearTimeout(timer); }
  }

  async findGroups(rawToken: string, username: string) {
    const token = rawToken.trim();
    if (!/^\d+:[A-Za-z0-9_-]+$/.test(token)) throw new Error('Incolla il token completo ricevuto da BotFather, con il numero e la parte dopo i due punti.');
    const identity = await this.request(token, 'getMe');
    if (String(identity.result?.username).toLowerCase() !== username.toLowerCase())
      throw new Error(`Questo token appartiene a un altro bot. Usa il token di @${username} oppure correggi lo username al passaggio 1.`);
    const webhook = await this.request(token, 'getWebhookInfo');
    if (webhook.result?.url) throw new Error('Questo bot è già collegato a un altro servizio. Inserisci il codice del gruppo manualmente oppure usa un nuovo bot.');
    // No offset: do not acknowledge pending updates or change Telegram settings.
    const updates = await this.request(token, 'getUpdates');
    return findGroupIds(JSON.stringify(updates));
  }
}

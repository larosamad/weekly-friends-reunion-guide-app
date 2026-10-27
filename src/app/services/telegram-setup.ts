import { Injectable } from '@angular/core';
import { findGroupIds } from './setup-progress';

@Injectable({ providedIn: 'root' })
export class TelegramSetup {
  private async request(token: string, method: string, parameters?: Record<string, unknown>): Promise<any> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      try {
        const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
          method: 'POST', signal: controller.signal,
          ...(parameters ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(parameters) } : {}),
        });
        const data = await response.json();
        if (response.status === 401 || response.status === 404) throw new TelegramRequestError('Token non riconosciuto. Copia il token completo dal messaggio di BotFather.');
        if (response.status === 409) throw new TelegramRequestError('Un altro servizio sta ricevendo i messaggi di questo bot. Mettilo in pausa oppure inserisci il codice del gruppo manualmente.');
        if (!response.ok || data.ok !== true) throw new TelegramRequestError('Telegram non riesce a completare la ricerca. Riprova tra poco.');
        return data;
      } catch (error) {
        if (error instanceof TelegramRequestError) throw error;
        // Native fetch can reject with a plain Error when canceled, not just AbortError.
        // These reads are safe to retry: no offset is sent and no update is acknowledged.
        if (attempt === 1)
          throw new Error('Connessione a Telegram interrotta. Controlla la connessione e riprova: non serve reinviare il comando per un errore di rete.');
      } finally { clearTimeout(timer); }
    }
  }

  /** Prepare reception before asking the user to send the command. */
  async prepareGroups(rawToken: string, username: string) {
    const { updates } = await this.readGroups(rawToken, username);
    return findGroupIds(JSON.stringify(updates));
  }

  private async readGroups(rawToken: string, username: string) {
    const token = rawToken.trim();
    if (!/^\d+:[A-Za-z0-9_-]+$/.test(token)) throw new Error('Incolla il token completo ricevuto da BotFather, con il numero e la parte dopo i due punti.');
    const identity = await this.request(token, 'getMe');
    if (String(identity.result?.username).toLowerCase() !== username.toLowerCase())
      throw new Error(`Questo token appartiene a un altro bot. Usa il token di @${username} oppure correggi lo username al passaggio 1.`);
    const webhook = await this.request(token, 'getWebhookInfo');
    if (webhook.result?.url) throw new Error('Questo bot è già collegato a un altro servizio. Inserisci il codice del gruppo manualmente oppure usa un nuovo bot.');
    // Preserve existing subscriptions and only add the events needed to discover groups.
    const allowed = webhook.result?.allowed_updates;
    const needsMessages = Array.isArray(allowed) && allowed.length > 0 && !allowed.includes('message');
    const parameters = {
      timeout: 0,
      ...(needsMessages ? { allowed_updates: [...new Set([...allowed, 'message', 'my_chat_member'])] } : {}),
    };
    // Never acknowledge or discard pending updates: another consumer may need them.
    const updates = await this.request(token, 'getUpdates', parameters);
    return { updates, needsMessages };
  }

  async findGroups(rawToken: string, username: string) {
    const { updates, needsMessages } = await this.readGroups(rawToken, username);
    const groups = findGroupIds(JSON.stringify(updates));
    if (groups.length) return groups;
    if (needsMessages)
      throw new Error(`La ricezione dei comandi era disattivata: ora è abilitata. Invia di nuovo /start@${username} nel gruppo, poi premi Cerca il mio gruppo.`);
    if (!updates.result.length)
      throw new Error(`Telegram non ha restituito messaggi per questo bot. Invia di nuovo /start@${username} nel gruppo e riprova. Se non cambia, controlla che nessun altro servizio stia ricevendo i messaggi del bot.`);
    if (updates.result.length >= 100)
      throw new Error('Il bot ha molti eventi in attesa e il gruppo potrebbe non essere tra quelli restituiti. Usa il codice del gruppo manualmente oppure completa il collegamento dal servizio che gestisce già il bot.');
    throw new Error(`Telegram ha restituito eventi, ma nessuno identifica un gruppo. Invia /start@${username} nel gruppo, non nella chat privata del bot, poi riprova.`);
  }
}

// Only deliberate API errors may reach the UI unchanged; native errors may contain tokens.
class TelegramRequestError extends Error {}

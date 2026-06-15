//+------------------------------------------------------------------+
//|  MentorGuard.mq5  —  Mentor Trade live mistake coach              |
//|                                                                  |
//|  A READ-ONLY Expert Advisor: it watches YOUR own trades and      |
//|  warns you in real time about the habits that cost money —       |
//|  trading without a stop-loss, risking too much, and revenge      |
//|  trading. It NEVER opens, modifies, or closes any order.         |
//|                                                                  |
//|  Channels (each optional): terminal popup + sound, push to the   |
//|  MetaTrader mobile app, and a webhook to the Mentor app (which    |
//|  forwards to Telegram + your dashboard).                          |
//+------------------------------------------------------------------+
#property copyright "Mentor Trade"
#property version   "1.00"
#property strict

input string InpBackendUrl     = "";     // Mentor webhook URL (optional) e.g. http://localhost:8000/api/ea/event
input string InpToken          = "";     // Your Mentor account token (from the app, optional)
input double InpMaxRiskPct     = 2.0;    // "Oversized" threshold: max risk per trade as % of balance
input int    InpGraceSeconds   = 60;     // Grace period to set a stop before we warn
input int    InpRevengeMinutes = 30;     // "Revenge trade" window after a losing close
input bool   InpAlertNoStop    = true;   // Warn when a position has no stop-loss
input bool   InpAlertOversized = true;   // Warn when risk exceeds InpMaxRiskPct
input bool   InpAlertRevenge   = true;   // Warn on a new trade right after a loss
input bool   InpPopup          = true;   // Terminal popup + sound
input bool   InpMobile         = true;   // Push to the MetaTrader mobile app (set MetaQuotes ID in Options)

ulong    g_warned_nostop[];      // tickets already warned: no stop
ulong    g_warned_oversized[];   // tickets already warned: oversized
datetime g_last_loss_close = 0;  // time of the last losing close (for revenge detection)

//+------------------------------------------------------------------+
int OnInit()
{
   EventSetTimer(3);  // re-scan open positions every 3 seconds
   Print("MentorGuard active — read-only coach. It will not trade.");
   if(StringLen(InpBackendUrl) > 0)
      Print("Webhook on. If alerts don't reach the app, add the URL under "
            "Tools->Options->Expert Advisors->Allow WebRequest for listed URL.");
   return(INIT_SUCCEEDED);
}

void OnDeinit(const int reason) { EventKillTimer(); }

//+------------------------------------------------------------------+
//| Re-scan open positions: no-stop and oversized checks             |
//+------------------------------------------------------------------+
void OnTimer()
{
   int total = PositionsTotal();
   for(int i = 0; i < total; i++)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0 || !PositionSelectByTicket(ticket))
         continue;

      string   sym       = PositionGetString(POSITION_SYMBOL);
      double   sl        = PositionGetDouble(POSITION_SL);
      double   vol       = PositionGetDouble(POSITION_VOLUME);
      double   open      = PositionGetDouble(POSITION_PRICE_OPEN);
      datetime open_time = (datetime)PositionGetInteger(POSITION_TIME);
      bool     grace     = (TimeCurrent() - open_time) >= InpGraceSeconds;

      // 1) No stop-loss
      if(InpAlertNoStop && sl == 0.0 && grace && !Contains(g_warned_nostop, ticket))
      {
         string m = StringFormat("⚠️ פתחת %s בלי stop-loss. שים סטופ עכשיו — "
                                 "הפסד אחד בלי סטופ מוחק כמה רווחים.", sym);
         Fire("no_stop_loss", sym, ticket, m);
         Append(g_warned_nostop, ticket);
      }

      // 2) Oversized risk (only computable when a stop is set)
      if(InpAlertOversized && sl != 0.0 && !Contains(g_warned_oversized, ticket))
      {
         double risk = RiskMoney(sym, open, sl, vol);
         double bal  = AccountInfoDouble(ACCOUNT_BALANCE);
         if(bal > 0 && risk > bal * InpMaxRiskPct / 100.0)
         {
            string m = StringFormat("⚠️ הסיכון בעסקה %s הוא כ-$%.0f — מעל %.0f%% מההון. "
                                    "הקטן פוזיציה או קרב את הסטופ.", sym, risk, InpMaxRiskPct);
            Fire("oversized", sym, ticket, m);
            Append(g_warned_oversized, ticket);
         }
      }
   }
}

//+------------------------------------------------------------------+
//| Trade events: revenge detection + losing-close tracking          |
//+------------------------------------------------------------------+
void OnTradeTransaction(const MqlTradeTransaction &trans,
                        const MqlTradeRequest &request,
                        const MqlTradeResult &result)
{
   if(trans.type != TRADE_TRANSACTION_DEAL_ADD)
      return;
   if(!HistoryDealSelect(trans.deal))
      return;

   long   entry  = HistoryDealGetInteger(trans.deal, DEAL_ENTRY);
   double profit = HistoryDealGetDouble(trans.deal, DEAL_PROFIT);
   string sym    = HistoryDealGetString(trans.deal, DEAL_SYMBOL);

   if(entry == DEAL_ENTRY_OUT && profit < 0)
      g_last_loss_close = TimeCurrent();

   if(entry == DEAL_ENTRY_IN && InpAlertRevenge && g_last_loss_close > 0)
   {
      int gap = (int)((TimeCurrent() - g_last_loss_close) / 60);
      if(gap <= InpRevengeMinutes)
      {
         string m = StringFormat("\U0001F6D1 פתחת %s רק %d דקות אחרי הפסד — זה מסחר נקמה, "
                                 "הדפוס שהכי פוגע. קח הפסקה קצרה.", sym, gap);
         Fire("revenge_trade", sym, trans.position, m);
      }
   }
}

//+------------------------------------------------------------------+
//| Deliver an alert across the enabled channels                     |
//+------------------------------------------------------------------+
void Fire(string type, string sym, ulong ref, string msg)
{
   if(InpPopup)  Alert(msg);
   if(InpMobile) SendNotification(msg);
   if(StringLen(InpBackendUrl) > 0 && StringLen(InpToken) > 0)
      PostBackend(type, sym, ref, msg);
   Print("MentorGuard: ", msg);
}

//+------------------------------------------------------------------+
//| Risk in account currency implied by the stop-loss distance       |
//+------------------------------------------------------------------+
double RiskMoney(string sym, double open, double sl, double vol)
{
   double tick_value = SymbolInfoDouble(sym, SYMBOL_TRADE_TICK_VALUE);
   double tick_size  = SymbolInfoDouble(sym, SYMBOL_TRADE_TICK_SIZE);
   if(tick_size <= 0)
      return 0.0;
   double ticks = MathAbs(open - sl) / tick_size;
   return ticks * tick_value * vol;
}

//+------------------------------------------------------------------+
//| POST the event to the Mentor backend (forwards to Telegram/app)  |
//+------------------------------------------------------------------+
void PostBackend(string type, string sym, ulong ref, string msg)
{
   string json = StringFormat(
      "{\"token\":\"%s\",\"type\":\"%s\",\"symbol\":\"%s\",\"ref\":\"%I64u\",\"message\":\"%s\"}",
      InpToken, type, sym, ref, JsonEscape(msg));

   char post[];
   int len = StringToCharArray(json, post, 0, WHOLE_ARRAY, CP_UTF8);
   if(len > 0) ArrayResize(post, len - 1);  // drop the terminating null

   char   result[];
   string result_headers;
   string headers = "Content-Type: application/json\r\n";
   ResetLastError();
   int code = WebRequest("POST", InpBackendUrl, headers, 5000, post, result, result_headers);
   if(code == -1)
      Print("MentorGuard webhook failed (allow the URL in Options->Expert Advisors). err=",
            GetLastError());
}

//+------------------------------------------------------------------+
//| Minimal JSON string escaping                                     |
//+------------------------------------------------------------------+
string JsonEscape(string s)
{
   StringReplace(s, "\\", "\\\\");
   StringReplace(s, "\"", "\\\"");
   StringReplace(s, "\n", " ");
   StringReplace(s, "\r", " ");
   return s;
}

//+------------------------------------------------------------------+
//| Small ulong-array helpers                                        |
//+------------------------------------------------------------------+
bool Contains(const ulong &arr[], ulong v)
{
   for(int i = 0; i < ArraySize(arr); i++)
      if(arr[i] == v) return true;
   return false;
}
void Append(ulong &arr[], ulong v)
{
   int n = ArraySize(arr);
   ArrayResize(arr, n + 1);
   arr[n] = v;
}
//+------------------------------------------------------------------+

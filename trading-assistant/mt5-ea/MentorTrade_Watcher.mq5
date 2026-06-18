//+------------------------------------------------------------------+
//|                                        MentorTrade_Watcher.mq5    |
//|        Mentor Trade — sends trade events to the cloud (read-only) |
//+------------------------------------------------------------------+
#property strict
#property version   "1.00"
#property description "Mentor Trade Watcher — reports every open/close to your Mentor cloud dashboard. Read-only: it never sends orders."

//--- Inputs (set these in the EA's Inputs tab when you attach it) ---
input string UserToken = "";  // your Mentor token (copy it from the website)
input string ServerURL = "https://mentor-trade.onrender.com/api/mt5/webhook";

//+------------------------------------------------------------------+
int OnInit()
  {
   if(StringLen(UserToken) == 0)
      Print("MentorTrade: ה-UserToken ריק — הזן את הטוקן שלך מהאתר בלשונית Inputs.");
   Print("MentorTrade Watcher פעיל. שולח אל: ", ServerURL);
   Print("MentorTrade: ודא שהכתובת מאושרת ב- Tools -> Options -> Expert Advisors -> Allow WebRequest for listed URL.");
   return(INIT_SUCCEEDED);
  }

//+------------------------------------------------------------------+
void OnDeinit(const int reason) {}
void OnTick() {}

//+------------------------------------------------------------------+
//| React to every executed deal (open / close)                      |
//+------------------------------------------------------------------+
void OnTradeTransaction(const MqlTradeTransaction &trans,
                        const MqlTradeRequest &request,
                        const MqlTradeResult &result)
  {
   if(trans.type != TRADE_TRANSACTION_DEAL_ADD)
      return;

   ulong deal_ticket = trans.deal;
   if(!HistoryDealSelect(deal_ticket))
      return;

   long dtype = HistoryDealGetInteger(deal_ticket, DEAL_TYPE);
   if(dtype != DEAL_TYPE_BUY && dtype != DEAL_TYPE_SELL)
      return;  // skip balance / credit / correction operations

   string symbol      = HistoryDealGetString(deal_ticket, DEAL_SYMBOL);
   long   entry       = HistoryDealGetInteger(deal_ticket, DEAL_ENTRY);
   double volume      = HistoryDealGetDouble(deal_ticket, DEAL_VOLUME);
   double price       = HistoryDealGetDouble(deal_ticket, DEAL_PRICE);
   double profit      = HistoryDealGetDouble(deal_ticket, DEAL_PROFIT);
   double swap        = HistoryDealGetDouble(deal_ticket, DEAL_SWAP);
   double commission  = HistoryDealGetDouble(deal_ticket, DEAL_COMMISSION);
   long   position_id = HistoryDealGetInteger(deal_ticket, DEAL_POSITION_ID);

   string action = (dtype == DEAL_TYPE_BUY) ? "buy" : "sell";
   string entryStr = "inout";
   if(entry == DEAL_ENTRY_IN)       entryStr = "in";
   else if(entry == DEAL_ENTRY_OUT) entryStr = "out";

   //--- stop-loss / take-profit come from the position (if still open)
   double sl = 0.0, tp = 0.0;
   if(PositionSelectByTicket(position_id))
     {
      sl = PositionGetDouble(POSITION_SL);
      tp = PositionGetDouble(POSITION_TP);
     }

   double balance = AccountInfoDouble(ACCOUNT_BALANCE);
   double equity  = AccountInfoDouble(ACCOUNT_EQUITY);
   double netpnl  = profit + swap + commission;

   //--- build JSON manually (no external libraries) ---
   string json = "{";
   json += "\"token\":\""     + UserToken + "\",";
   json += "\"deal_id\":"     + IntegerToString((long)deal_ticket) + ",";
   json += "\"position_id\":" + IntegerToString(position_id) + ",";
   json += "\"symbol\":\""    + symbol + "\",";
   json += "\"action\":\""    + action + "\",";
   json += "\"entry\":\""     + entryStr + "\",";
   json += "\"volume\":"      + DoubleToString(volume, 2) + ",";
   json += "\"price\":"       + DoubleToString(price, 5) + ",";
   json += "\"sl\":"          + DoubleToString(sl, 5) + ",";
   json += "\"tp\":"          + DoubleToString(tp, 5) + ",";
   json += "\"profit\":"      + DoubleToString(netpnl, 2) + ",";
   json += "\"balance\":"     + DoubleToString(balance, 2) + ",";
   json += "\"equity\":"      + DoubleToString(equity, 2);
   json += "}";

   SendToServer(json);
  }

//+------------------------------------------------------------------+
//| POST the JSON payload to the Mentor cloud via WebRequest         |
//+------------------------------------------------------------------+
void SendToServer(string json)
  {
   if(StringLen(ServerURL) == 0 || StringLen(UserToken) == 0)
      return;

   char post[];
   char result[];
   string result_headers;
   int len = StringToCharArray(json, post, 0, StringLen(json), CP_UTF8);
   string headers = "Content-Type: application/json\r\n";

   ResetLastError();
   int code = WebRequest("POST", ServerURL, headers, 5000, post, result, result_headers);

   if(code == -1)
     {
      int err = GetLastError();
      if(err == 4014 || err == 4060)
         Print("MentorTrade: הכתובת לא מאושרת. הוסף אותה ב- Tools -> Options -> Expert Advisors. (err ", err, ")");
      else
         Print("MentorTrade: שליחה נכשלה (err ", err, ").");
     }
   else
     {
      Print("MentorTrade: נשלח [", code, "] ", json);
     }
  }
//+------------------------------------------------------------------+

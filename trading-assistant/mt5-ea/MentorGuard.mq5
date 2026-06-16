//+------------------------------------------------------------------+
//|  MentorGuard.mq5  —  Mentor Trade live coach, INSIDE MetaTrader 5 |
//|                                                                  |
//|  Draws a live panel in the chart corner showing your account,    |
//|  every open position and whether it has a stop-loss, your risk,  |
//|  and live warnings (no stop-loss / oversized / revenge trade).   |
//|  Also pops MT5 alerts + mobile push. READ-ONLY — never trades.   |
//+------------------------------------------------------------------+
#property copyright "Mentor Trade"
#property version   "2.00"
#property strict

input double InpMaxRiskPct     = 2.0;    // "Oversized" threshold: max risk per trade as % of balance
input int    InpGraceSeconds   = 60;     // Grace period to set a stop before warning
input int    InpRevengeMinutes = 30;     // "Revenge trade" window after a losing close
input bool   InpPopup          = true;   // MT5 popup + sound on a mistake
input bool   InpMobile         = true;   // Push to the MetaTrader mobile app
input color  InpAccent         = clrSpringGreen;

string   PFX = "MG_";          // chart-object name prefix
ulong    g_warned_nostop[];
ulong    g_warned_oversized[];
datetime g_last_loss_close = 0;
string   g_last_warning = "";

//+------------------------------------------------------------------+
int OnInit()
{
   EventSetTimer(2);
   DrawPanel();
   return(INIT_SUCCEEDED);
}

void OnDeinit(const int reason)
{
   EventKillTimer();
   ObjectsDeleteAll(0, PFX);
   ChartRedraw();
}

void OnTick()  { DrawPanel(); }
void OnTimer() { CheckMistakes(); DrawPanel(); }

//+------------------------------------------------------------------+
//| The on-chart panel (upper-right corner)                          |
//+------------------------------------------------------------------+
void DrawPanel()
{
   string lines[];
   color  colors[];
   int    n = 0;

   double bal = AccountInfoDouble(ACCOUNT_BALANCE);
   long   login = AccountInfoInteger(ACCOUNT_LOGIN);
   string cur = AccountInfoString(ACCOUNT_CURRENCY);

   AddLine(lines, colors, n, "מנטור — שומר המסחר", InpAccent);
   AddLine(lines, colors, n, StringFormat("חשבון %I64d  |  יתרה %.0f %s", login, bal, cur), clrWhite);
   AddLine(lines, colors, n, "————————————————", clrGray);

   int total = PositionsTotal();
   int nostop = 0;
   AddLine(lines, colors, n, StringFormat("פוזיציות פתוחות: %d", total), clrWhite);

   for(int i = 0; i < total && i < 8; i++)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0 || !PositionSelectByTicket(ticket)) continue;
      string sym = PositionGetString(POSITION_SYMBOL);
      double sl  = PositionGetDouble(POSITION_SL);
      double vol = PositionGetDouble(POSITION_VOLUME);
      double op  = PositionGetDouble(POSITION_PRICE_OPEN);
      if(sl == 0.0)
      {
         nostop++;
         AddLine(lines, colors, n, StringFormat("✗ %s  %.2f לוט  —  אין סטופ!", sym, vol), clrTomato);
      }
      else
      {
         double risk = RiskMoney(sym, op, sl, vol);
         double pct  = (bal > 0) ? risk / bal * 100.0 : 0;
         color c = (pct > InpMaxRiskPct) ? clrOrange : clrLimeGreen;
         AddLine(lines, colors, n, StringFormat("✓ %s  %.2f לוט  —  סיכון %.1f%%", sym, vol, pct), c);
      }
   }

   AddLine(lines, colors, n, "————————————————", clrGray);
   if(nostop > 0)
      AddLine(lines, colors, n, StringFormat("⚠️ %d עסקאות בלי stop-loss — שים סטופ!", nostop), clrTomato);
   else if(total == 0)
      AddLine(lines, colors, n, "אין עסקאות פתוחות — שומר עליך.", clrSilver);
   else
      AddLine(lines, colors, n, "✅ הכל תקין — לכל העסקאות יש סטופ.", clrLimeGreen);

   if(g_last_warning != "")
      AddLine(lines, colors, n, "📣 " + g_last_warning, clrOrange);

   RenderPanel(lines, colors, n);
}

void AddLine(string &lines[], color &colors[], int &n, string text, color c)
{
   ArrayResize(lines, n + 1);
   ArrayResize(colors, n + 1);
   lines[n] = text;
   colors[n] = c;
   n++;
}

void RenderPanel(string &lines[], color &colors[], int n)
{
   int pad = 12, lineH = 20, width = 340;
   int height = n * lineH + pad * 2;

   // background
   string bg = PFX + "bg";
   if(ObjectFind(0, bg) < 0) ObjectCreate(0, bg, OBJ_RECTANGLE_LABEL, 0, 0, 0);
   ObjectSetInteger(0, bg, OBJPROP_CORNER, CORNER_RIGHT_UPPER);
   ObjectSetInteger(0, bg, OBJPROP_XDISTANCE, 10);
   ObjectSetInteger(0, bg, OBJPROP_YDISTANCE, 12);
   ObjectSetInteger(0, bg, OBJPROP_XSIZE, width);
   ObjectSetInteger(0, bg, OBJPROP_YSIZE, height);
   ObjectSetInteger(0, bg, OBJPROP_BGCOLOR, C'11,16,32');
   ObjectSetInteger(0, bg, OBJPROP_BORDER_TYPE, BORDER_FLAT);
   ObjectSetInteger(0, bg, OBJPROP_COLOR, C'40,49,83');
   ObjectSetInteger(0, bg, OBJPROP_BACK, false);
   ObjectSetInteger(0, bg, OBJPROP_SELECTABLE, false);

   for(int i = 0; i < n; i++)
   {
      string name = PFX + "l" + (string)i;
      if(ObjectFind(0, name) < 0) ObjectCreate(0, name, OBJ_LABEL, 0, 0, 0);
      ObjectSetInteger(0, name, OBJPROP_CORNER, CORNER_RIGHT_UPPER);
      ObjectSetInteger(0, name, OBJPROP_ANCHOR, ANCHOR_RIGHT_UPPER);
      ObjectSetInteger(0, name, OBJPROP_XDISTANCE, 22);
      ObjectSetInteger(0, name, OBJPROP_YDISTANCE, pad + 12 + i * lineH);
      ObjectSetString(0, name, OBJPROP_TEXT, lines[i]);
      ObjectSetString(0, name, OBJPROP_FONT, (i == 0) ? "Arial Bold" : "Arial");
      ObjectSetInteger(0, name, OBJPROP_FONTSIZE, (i == 0) ? 11 : 9);
      ObjectSetInteger(0, name, OBJPROP_COLOR, colors[i]);
      ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
   }
   // remove leftover lines from a previous (longer) render
   for(int i = n; i < 40; i++)
   {
      string name = PFX + "l" + (string)i;
      if(ObjectFind(0, name) >= 0) ObjectDelete(0, name);
   }
   ChartRedraw();
}

//+------------------------------------------------------------------+
//| Mistake detection (alerts)                                       |
//+------------------------------------------------------------------+
void CheckMistakes()
{
   int total = PositionsTotal();
   for(int i = 0; i < total; i++)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0 || !PositionSelectByTicket(ticket)) continue;
      string sym = PositionGetString(POSITION_SYMBOL);
      double sl  = PositionGetDouble(POSITION_SL);
      double vol = PositionGetDouble(POSITION_VOLUME);
      double op  = PositionGetDouble(POSITION_PRICE_OPEN);
      datetime ot = (datetime)PositionGetInteger(POSITION_TIME);
      bool grace = (TimeCurrent() - ot) >= InpGraceSeconds;

      if(sl == 0.0 && grace && !Contains(g_warned_nostop, ticket))
      {
         Fire("no_stop_loss", sym, ticket,
              StringFormat("פתחת %s בלי stop-loss. שים סטופ עכשיו.", sym));
         Append(g_warned_nostop, ticket);
      }
      if(sl != 0.0 && !Contains(g_warned_oversized, ticket))
      {
         double bal = AccountInfoDouble(ACCOUNT_BALANCE);
         double risk = RiskMoney(sym, op, sl, vol);
         if(bal > 0 && risk > bal * InpMaxRiskPct / 100.0)
         {
            Fire("oversized", sym, ticket,
                 StringFormat("סיכון גבוה ב-%s (~%.0f%% מההון). הקטן פוזיציה.",
                              sym, risk / bal * 100.0));
            Append(g_warned_oversized, ticket);
         }
      }
   }
}

void OnTradeTransaction(const MqlTradeTransaction &trans,
                        const MqlTradeRequest &request,
                        const MqlTradeResult &result)
{
   if(trans.type != TRADE_TRANSACTION_DEAL_ADD) return;
   if(!HistoryDealSelect(trans.deal)) return;
   long   entry  = HistoryDealGetInteger(trans.deal, DEAL_ENTRY);
   double profit = HistoryDealGetDouble(trans.deal, DEAL_PROFIT);
   string sym    = HistoryDealGetString(trans.deal, DEAL_SYMBOL);

   if(entry == DEAL_ENTRY_OUT && profit < 0)
      g_last_loss_close = TimeCurrent();
   if(entry == DEAL_ENTRY_IN && g_last_loss_close > 0)
   {
      int gap = (int)((TimeCurrent() - g_last_loss_close) / 60);
      if(gap <= InpRevengeMinutes)
         Fire("revenge_trade", sym, trans.position,
              StringFormat("פתחת %s רק %d דק' אחרי הפסד — מסחר נקמה. קח הפסקה.", sym, gap));
   }
}

void Fire(string type, string sym, ulong ref, string msg)
{
   g_last_warning = msg;
   if(InpPopup)  Alert(msg);
   if(InpMobile) SendNotification(msg);
   DrawPanel();
}

double RiskMoney(string sym, double open, double sl, double vol)
{
   double tv = SymbolInfoDouble(sym, SYMBOL_TRADE_TICK_VALUE);
   double ts = SymbolInfoDouble(sym, SYMBOL_TRADE_TICK_SIZE);
   if(ts <= 0) return 0.0;
   return MathAbs(open - sl) / ts * tv * vol;
}

bool Contains(const ulong &arr[], ulong v)
{
   for(int i = 0; i < ArraySize(arr); i++) if(arr[i] == v) return true;
   return false;
}
void Append(ulong &arr[], ulong v)
{
   int k = ArraySize(arr); ArrayResize(arr, k + 1); arr[k] = v;
}
//+------------------------------------------------------------------+

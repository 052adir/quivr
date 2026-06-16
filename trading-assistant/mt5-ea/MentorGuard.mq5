//+------------------------------------------------------------------+
//|  MentorGuard.mq5  —  Mentor Trade behavioral coach (read-only)    |
//|                                                                  |
//|  Warns the trader AT THE MOMENT OF TEMPTATION, with their own    |
//|  numbers — but never trades, never blocks. The trader decides.   |
//|   • Right after a loss: a flashing "don't revenge-trade" warning  |
//|     that shows how much revenge trading has ALREADY cost them.    |
//|   • A position with no stop-loss: a flashing red "set a stop!".   |
//|  Plus a live info panel and MT5 popup + mobile push.              |
//+------------------------------------------------------------------+
#property copyright "Mentor Trade"
#property version   "3.00"
#property strict

input double InpMaxRiskPct     = 2.0;    // "Oversized" threshold: max risk per trade as % of balance
input int    InpRevengeMinutes = 60;     // Cooldown window after a loss (minutes)
input int    InpGraceSeconds   = 20;     // Seconds before the no-stop popup (banner is instant)
input bool   InpPopup          = true;   // MT5 popup + sound
input bool   InpMobile         = true;   // Push to the MetaTrader mobile app
input color  InpAccent         = clrSpringGreen;

string   PFX = "MG_";
ulong    g_warned_nostop[];
ulong    g_warned_oversized[];
datetime g_cooldown_until = 0;     // revenge cooldown end time
double   g_revenge_loss   = 0;     // historical $ lost on revenge trades (negative)
bool     g_flash          = false; // flashing toggle

//+------------------------------------------------------------------+
int OnInit()
{
   ComputeRevengeCost();
   EventSetTimer(1);
   DrawPanel();
   return(INIT_SUCCEEDED);
}
void OnDeinit(const int reason)
{
   EventKillTimer();
   ObjectsDeleteAll(0, PFX);
   ChartRedraw();
}
void OnTick() { DrawPanel(); }
void OnTimer()
{
   g_flash = !g_flash;
   CheckNoStop();
   DrawPanel();
   DrawBanner();
}

//+------------------------------------------------------------------+
//| Trade events: the proactive revenge warning fires on the LOSS    |
//+------------------------------------------------------------------+
void OnTradeTransaction(const MqlTradeTransaction &trans,
                        const MqlTradeRequest &request,
                        const MqlTradeResult &result)
{
   if(trans.type != TRADE_TRANSACTION_DEAL_ADD) return;
   if(!HistoryDealSelect(trans.deal)) return;
   long   entry  = HistoryDealGetInteger(trans.deal, DEAL_ENTRY);
   double profit = HistoryDealGetDouble(trans.deal, DEAL_PROFIT);

   // The moment a losing trade closes -> warn BEFORE they revenge-trade.
   if(entry == DEAL_ENTRY_OUT && profit < 0)
   {
      g_cooldown_until = TimeCurrent() + InpRevengeMinutes * 60;
      ComputeRevengeCost();
      string m = "אל תפתח עסקה בשעה הקרובה!!!";
      if(g_revenge_loss < 0)
         m += StringFormat(" מסחר נקמה כבר עלה לך $%.0f.", MathAbs(g_revenge_loss));
      else
         m += " אחרי הפסד נוטים לטעות — קח הפסקה.";
      Notify(m);
   }
   // If they open anyway during the cooldown — call it out.
   if(entry == DEAL_ENTRY_IN && TimeCurrent() < g_cooldown_until)
   {
      string sym = HistoryDealGetString(trans.deal, DEAL_SYMBOL);
      Notify(StringFormat("זו עסקת נקמה ב-%s. בעבר זה עלה לך $%.0f. שקול לסגור.",
                          sym, MathAbs(g_revenge_loss)));
   }
}

//+------------------------------------------------------------------+
//| No-stop watch (popup after grace; banner is instant via DrawBanner)|
//+------------------------------------------------------------------+
void CheckNoStop()
{
   int total = PositionsTotal();
   for(int i = 0; i < total; i++)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0 || !PositionSelectByTicket(ticket)) continue;
      double sl  = PositionGetDouble(POSITION_SL);
      string sym = PositionGetString(POSITION_SYMBOL);
      datetime ot = (datetime)PositionGetInteger(POSITION_TIME);
      if(sl == 0.0 && (TimeCurrent() - ot) >= InpGraceSeconds
         && !Contains(g_warned_nostop, ticket))
      {
         Notify(StringFormat("לא שמת STOP-LOSS על %s! שים סטופ עכשיו.", sym));
         Append(g_warned_nostop, ticket);
      }
   }
}

void Notify(string msg)
{
   if(InpPopup)  Alert(msg);
   if(InpMobile) SendNotification(msg);
}

//+------------------------------------------------------------------+
//| Big flashing warning banner (top-center) — advisory only          |
//+------------------------------------------------------------------+
void DrawBanner()
{
   string msg = "";
   // priority 1: a position with no stop
   int total = PositionsTotal();
   for(int i = 0; i < total; i++)
   {
      ulong t = PositionGetTicket(i);
      if(t && PositionSelectByTicket(t) && PositionGetDouble(POSITION_SL) == 0.0)
      { msg = "⚠️ לא שמת STOP-LOSS!"; break; }
   }
   // priority 2: revenge cooldown
   if(msg == "" && TimeCurrent() < g_cooldown_until)
   {
      int mins = (int)((g_cooldown_until - TimeCurrent()) / 60) + 1;
      msg = StringFormat("עצור! אל תפתח עסקה (%d דק') — מסחר נקמה עלה לך $%.0f",
                         mins, MathAbs(g_revenge_loss));
   }

   string bg = PFX + "ban_bg", tx = PFX + "ban_tx";
   if(msg == "")
   {
      ObjectDelete(0, bg);
      ObjectDelete(0, tx);
      ChartRedraw();
      return;
   }

   int chartW = (int)ChartGetInteger(0, CHART_WIDTH_IN_PIXELS);
   int w = 560, h = 54, x = (chartW - w) / 2; if(x < 10) x = 10;
   if(ObjectFind(0, bg) < 0) ObjectCreate(0, bg, OBJ_RECTANGLE_LABEL, 0, 0, 0);
   ObjectSetInteger(0, bg, OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(0, bg, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, bg, OBJPROP_YDISTANCE, 70);
   ObjectSetInteger(0, bg, OBJPROP_XSIZE, w);
   ObjectSetInteger(0, bg, OBJPROP_YSIZE, h);
   ObjectSetInteger(0, bg, OBJPROP_BGCOLOR, g_flash ? clrRed : C'90,0,0');
   ObjectSetInteger(0, bg, OBJPROP_BORDER_TYPE, BORDER_FLAT);
   ObjectSetInteger(0, bg, OBJPROP_COLOR, clrWhite);
   ObjectSetInteger(0, bg, OBJPROP_SELECTABLE, false);

   if(ObjectFind(0, tx) < 0) ObjectCreate(0, tx, OBJ_LABEL, 0, 0, 0);
   ObjectSetInteger(0, tx, OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(0, tx, OBJPROP_ANCHOR, ANCHOR_LEFT_UPPER);
   ObjectSetInteger(0, tx, OBJPROP_XDISTANCE, x + 16);
   ObjectSetInteger(0, tx, OBJPROP_YDISTANCE, 86);
   ObjectSetString(0, tx, OBJPROP_TEXT, msg);
   ObjectSetString(0, tx, OBJPROP_FONT, "Arial Bold");
   ObjectSetInteger(0, tx, OBJPROP_FONTSIZE, 13);
   ObjectSetInteger(0, tx, OBJPROP_COLOR, clrWhite);
   ObjectSetInteger(0, tx, OBJPROP_SELECTABLE, false);
   ChartRedraw();
}

//+------------------------------------------------------------------+
//| Live info panel (top-right corner)                                |
//+------------------------------------------------------------------+
void DrawPanel()
{
   string lines[]; color colors[]; int n = 0;
   double bal = AccountInfoDouble(ACCOUNT_BALANCE);
   long   login = AccountInfoInteger(ACCOUNT_LOGIN);

   AddLine(lines, colors, n, "מנטור — שומר המסחר", InpAccent);
   AddLine(lines, colors, n, StringFormat("חשבון %I64d  |  יתרה %.0f", login, bal), clrWhite);
   if(g_revenge_loss < 0)
      AddLine(lines, colors, n, StringFormat("מסחר נקמה עלה לך עד היום: $%.0f", MathAbs(g_revenge_loss)), clrOrange);
   AddLine(lines, colors, n, "————————————————", clrGray);

   int total = PositionsTotal(), nostop = 0;
   AddLine(lines, colors, n, StringFormat("פוזיציות פתוחות: %d", total), clrWhite);
   for(int i = 0; i < total && i < 7; i++)
   {
      ulong t = PositionGetTicket(i);
      if(t == 0 || !PositionSelectByTicket(t)) continue;
      string sym = PositionGetString(POSITION_SYMBOL);
      double sl = PositionGetDouble(POSITION_SL), vol = PositionGetDouble(POSITION_VOLUME);
      double op = PositionGetDouble(POSITION_PRICE_OPEN);
      if(sl == 0.0) { nostop++; AddLine(lines, colors, n, StringFormat("✗ %s  %.2f  אין סטופ!", sym, vol), clrTomato); }
      else
      {
         double pct = (bal > 0) ? RiskMoney(sym, op, sl, vol) / bal * 100.0 : 0;
         AddLine(lines, colors, n, StringFormat("✓ %s  %.2f  סיכון %.1f%%", sym, vol, pct),
                 (pct > InpMaxRiskPct) ? clrOrange : clrLimeGreen);
      }
   }
   RenderPanel(lines, colors, n);
}

void AddLine(string &l[], color &c[], int &n, string t, color col)
{ ArrayResize(l, n + 1); ArrayResize(c, n + 1); l[n] = t; c[n] = col; n++; }

void RenderPanel(string &lines[], color &colors[], int n)
{
   int lineH = 20, width = 330, height = n * lineH + 24;
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
   ObjectSetInteger(0, bg, OBJPROP_SELECTABLE, false);
   for(int i = 0; i < n; i++)
   {
      string name = PFX + "l" + (string)i;
      if(ObjectFind(0, name) < 0) ObjectCreate(0, name, OBJ_LABEL, 0, 0, 0);
      ObjectSetInteger(0, name, OBJPROP_CORNER, CORNER_RIGHT_UPPER);
      ObjectSetInteger(0, name, OBJPROP_ANCHOR, ANCHOR_RIGHT_UPPER);
      ObjectSetInteger(0, name, OBJPROP_XDISTANCE, 22);
      ObjectSetInteger(0, name, OBJPROP_YDISTANCE, 22 + i * lineH);
      ObjectSetString(0, name, OBJPROP_TEXT, lines[i]);
      ObjectSetString(0, name, OBJPROP_FONT, (i == 0) ? "Arial Bold" : "Arial");
      ObjectSetInteger(0, name, OBJPROP_FONTSIZE, (i == 0) ? 11 : 9);
      ObjectSetInteger(0, name, OBJPROP_COLOR, colors[i]);
      ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
   }
   for(int i = n; i < 40; i++) { string nm = PFX + "l" + (string)i; if(ObjectFind(0, nm) >= 0) ObjectDelete(0, nm); }
   ChartRedraw();
}

//+------------------------------------------------------------------+
//| Compute how much revenge trading has cost so far ($, negative)    |
//+------------------------------------------------------------------+
void ComputeRevengeCost()
{
   datetime from = TimeCurrent() - 90 * 24 * 60 * 60;
   if(!HistorySelect(from, TimeCurrent())) return;
   ulong ids[]; datetime opent[]; datetime closet[]; double net[];
   int total = HistoryDealsTotal();
   for(int i = 0; i < total; i++)
   {
      ulong deal = HistoryDealGetTicket(i);
      if(deal == 0) continue;
      long dt = HistoryDealGetInteger(deal, DEAL_TYPE);
      if(dt != DEAL_TYPE_BUY && dt != DEAL_TYPE_SELL) continue;
      ulong pid = (ulong)HistoryDealGetInteger(deal, DEAL_POSITION_ID);
      long entry = HistoryDealGetInteger(deal, DEAL_ENTRY);
      datetime t = (datetime)HistoryDealGetInteger(deal, DEAL_TIME);
      double pr = HistoryDealGetDouble(deal, DEAL_PROFIT)
                + HistoryDealGetDouble(deal, DEAL_SWAP)
                + HistoryDealGetDouble(deal, DEAL_COMMISSION);
      int idx = -1;
      for(int k = 0; k < ArraySize(ids); k++) if(ids[k] == pid) { idx = k; break; }
      if(idx < 0)
      {
         idx = ArraySize(ids);
         ArrayResize(ids, idx + 1); ArrayResize(opent, idx + 1);
         ArrayResize(closet, idx + 1); ArrayResize(net, idx + 1);
         ids[idx] = pid; opent[idx] = 0; closet[idx] = 0; net[idx] = 0;
      }
      if(entry == DEAL_ENTRY_IN  && (opent[idx] == 0 || t < opent[idx])) opent[idx] = t;
      if(entry == DEAL_ENTRY_OUT) { if(t > closet[idx]) closet[idx] = t; net[idx] += pr; }
   }
   double revenge = 0; int nn = ArraySize(ids);
   for(int i = 0; i < nn; i++)
   {
      if(opent[i] == 0 || net[i] >= 0) continue;       // only losing positions
      for(int j = 0; j < nn; j++)
      {
         if(j == i || closet[j] == 0 || net[j] >= 0) continue;
         long gap = (long)(opent[i] - closet[j]);
         if(gap >= 0 && gap <= InpRevengeMinutes * 60) { revenge += net[i]; break; }
      }
   }
   g_revenge_loss = revenge;
}

double RiskMoney(string sym, double open, double sl, double vol)
{
   double tv = SymbolInfoDouble(sym, SYMBOL_TRADE_TICK_VALUE);
   double ts = SymbolInfoDouble(sym, SYMBOL_TRADE_TICK_SIZE);
   if(ts <= 0) return 0.0;
   return MathAbs(open - sl) / ts * tv * vol;
}
bool Contains(const ulong &a[], ulong v){ for(int i=0;i<ArraySize(a);i++) if(a[i]==v) return true; return false; }
void Append(ulong &a[], ulong v){ int k=ArraySize(a); ArrayResize(a,k+1); a[k]=v; }
//+------------------------------------------------------------------+

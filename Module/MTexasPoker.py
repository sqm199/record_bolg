"""德州扑克游戏引擎 — 单机模式"""
import random
import itertools
import time


# ═══════════════════════════════════════════════════════════════════════════
# 基础数据结构
# ═══════════════════════════════════════════════════════════════════════════

SUITS = ['♠', '♥', '♦', '♣']
SUIT_COLORS = {'♠': 'black', '♣': 'black', '♥': 'red', '♦': 'red'}
RANK_NAMES = {2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8',
              9: '9', 10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A'}
RANK_VALUES = {r: i for i, r in enumerate(sorted(RANK_NAMES.keys()), start=1)}


class Card:
    """一张扑克牌"""
    __slots__ = ('rank', 'suit')

    def __init__(self, rank, suit):
        self.rank = rank   # 2-14
        self.suit = suit   # '♠' '♥' '♦' '♣'

    def __repr__(self):
        return f'{RANK_NAMES[self.rank]}{self.suit}'

    def to_dict(self):
        return {'rank': self.rank, 'suit': self.suit, 'name': str(self)}


class Deck:
    """一副 52 张牌"""
    def __init__(self):
        self.cards = [Card(r, s) for r in RANK_NAMES for s in SUITS]
        self.used = 0

    def shuffle(self):
        random.shuffle(self.cards)
        self.used = 0

    def deal(self, n=1):
        cards = self.cards[self.used:self.used + n]
        self.used += n
        return cards if n > 1 else cards[0]


# ═══════════════════════════════════════════════════════════════════════════
# 手牌评估
# ═══════════════════════════════════════════════════════════════════════════

HAND_TYPES = {
    'high_card': 0, 'one_pair': 1, 'two_pair': 2, 'three_kind': 3,
    'straight': 4, 'flush': 5, 'full_house': 6, 'four_kind': 7,
    'straight_flush': 8, 'royal_flush': 9,
}
HAND_NAMES = {v: k for k, v in HAND_TYPES.items()}


def _eval_5(cards):
    """评估 5 张牌的手牌类型和比较值。
    返回 (hand_type, ranks_desc) — ranks_desc 为 5 个 rank 降序排列，顺子用最大牌。"""
    ranks = sorted([c.rank for c in cards], reverse=True)
    suits = [c.suit for c in cards]
    is_flush = len(set(suits)) == 1

    # 判断顺子（A-2-3-4-5 特殊处理）
    rank_set = set(ranks)
    is_straight = (len(rank_set) == 5 and max(ranks) - min(ranks) == 4)
    # A-2-3-4-5 顺子（轮子）
    if rank_set == {14, 2, 3, 4, 5}:
        is_straight = True
        ranks = [5, 4, 3, 2, 1]  # A 当 1 用

    if is_flush and is_straight:
        if ranks[0] == 14:
            return (HAND_TYPES['royal_flush'], ranks)
        return (HAND_TYPES['straight_flush'], ranks)

    # 统计 rank 频次
    from collections import Counter
    freq = Counter(ranks)
    counts = sorted(freq.items(), key=lambda x: (x[1], x[0]), reverse=True)

    if counts[0][1] == 4:
        quads = counts[0][0]
        kicker = counts[1][0]
        return (HAND_TYPES['four_kind'], [quads] * 4 + [kicker])
    if counts[0][1] == 3 and counts[1][1] == 2:
        return (HAND_TYPES['full_house'], [counts[0][0]] * 3 + [counts[1][0]] * 2)
    if is_flush:
        return (HAND_TYPES['flush'], ranks)
    if is_straight:
        return (HAND_TYPES['straight'], ranks)
    if counts[0][1] == 3:
        trips = counts[0][0]
        kickers = sorted([c[0] for c in counts[1:]], reverse=True)
        return (HAND_TYPES['three_kind'], [trips] * 3 + kickers)
    if counts[0][1] == 2 and counts[1][1] == 2:
        pairs = sorted([counts[0][0], counts[1][0]], reverse=True)
        kicker = counts[2][0]
        return (HAND_TYPES['two_pair'], pairs * 2 + [kicker])  # simplified
    if counts[0][1] == 2:
        pair = counts[0][0]
        kickers = sorted([c[0] for c in counts[1:]], reverse=True)
        return (HAND_TYPES['one_pair'], [pair] * 2 + kickers)
    return (HAND_TYPES['high_card'], ranks)


def evaluate_best_hand(cards_7):
    """从 7 张牌中选出最佳 5 张手牌。
    返回 (hand_type, best_5_cards, description)"""
    if len(cards_7) < 5:
        # 不足 5 张牌时（边界情况），按高牌评估
        ranks = sorted([c.rank for c in cards_7], reverse=True)
        while len(ranks) < 5:
            ranks.append(0)
        return HAND_TYPES['high_card'], list(cards_7), '高牌'

    best_val = (-1, [])
    best_combo = None

    for combo in itertools.combinations(cards_7, 5):
        ht, ranks = _eval_5(list(combo))
        val = (ht, ranks)
        if val > best_val:
            best_val = val
            best_combo = combo

    ht, ranks = best_val
    name = HAND_NAMES[ht]
    name_cn = {
        'high_card': '高牌', 'one_pair': '一对', 'two_pair': '两对',
        'three_kind': '三条', 'straight': '顺子', 'flush': '同花',
        'full_house': '葫芦', 'four_kind': '四条',
        'straight_flush': '同花顺', 'royal_flush': '皇家同花顺',
    }.get(name, name)
    return ht, list(best_combo), name_cn


def _hand_strength_percentile(hand_type, ranks):
    """粗略估计手牌强度百分位（0=最弱, 1=最强）。
    用于 bot AI 决策。"""
    base = hand_type / 9.0
    # 高牌修正
    if hand_type == HAND_TYPES['high_card']:
        return 0.05 + (max(ranks) - 2) * 0.04
    if hand_type == HAND_TYPES['one_pair']:
        return 0.25 + (ranks[0] - 2) * 0.06
    if hand_type == HAND_TYPES['two_pair']:
        return 0.45 + (ranks[0] - 2) * 0.04
    if hand_type == HAND_TYPES['three_kind']:
        return 0.60 + (ranks[0] - 2) * 0.04
    if hand_type == HAND_TYPES['straight']:
        return 0.70 + (ranks[0] - 5) * 0.04
    if hand_type == HAND_TYPES['flush']:
        return 0.75 + (ranks[0] - 2) * 0.025
    if hand_type == HAND_TYPES['full_house']:
        return 0.85 + (ranks[0] - 2) * 0.02
    if hand_type == HAND_TYPES['four_kind']:
        return 0.92 + (ranks[0] - 2) * 0.015
    if hand_type in (HAND_TYPES['straight_flush'], HAND_TYPES['royal_flush']):
        return 0.97
    return base


def _hole_card_strength(c1, c2):
    """评估起手牌强度（0-1）。
    考虑：对子、同花、连张、高牌。"""
    r1, r2 = c1.rank, c2.rank
    suited = 1 if c1.suit == c2.suit else 0
    is_pair = 1 if r1 == r2 else 0
    gap = abs(r1 - r2)
    high = max(r1, r2)
    low = min(r1, r2)

    score = 0.0
    if is_pair:
        score = 0.5 + (high - 2) * 0.04  # 对子：0.5~0.98
    else:
        score = 0.1 + (high - 2) * 0.03 + (low - 2) * 0.015
        if suited:
            score += 0.08
        if gap <= 2:
            score += 0.06
        if gap == 0:  # 已经是对子，跳过
            pass
    return min(score, 0.98)


# ═══════════════════════════════════════════════════════════════════════════
# 游戏状态机
# ═══════════════════════════════════════════════════════════════════════════

BOT_NAMES = ['🤖 阿尔法', '🤖 布拉沃', '🤖 查理', '🤖 德尔塔']
INITIAL_CHIPS = 2000
SMALL_BLIND = 10
BIG_BLIND = 20


class Player:
    """玩家（真人或 bot）"""
    __slots__ = ('name', 'chips', 'hole_cards', 'current_bet',
                 'total_bet', 'folded', 'all_in', 'is_human', 'hand_info')

    def __init__(self, name, chips, is_human=False):
        self.name = name
        self.chips = chips
        self.hole_cards = []
        self.current_bet = 0
        self.total_bet = 0
        self.folded = False
        self.all_in = False
        self.is_human = is_human
        self.hand_info = None  # 摊牌时填充

    def reset_for_round(self):
        self.hole_cards = []
        self.current_bet = 0
        self.total_bet = 0
        self.folded = False
        self.all_in = False
        self.hand_info = None

    def bet(self, amount):
        """下注，返回实际下注金额"""
        actual = min(amount, self.chips)
        self.chips -= actual
        self.current_bet += actual
        self.total_bet += actual
        if self.chips == 0:
            self.all_in = True
        return actual

    def to_dict(self, reveal=False):
        d = {
            'name': self.name,
            'chips': self.chips,
            'current_bet': self.current_bet,
            'folded': self.folded,
            'all_in': self.all_in,
            'is_human': self.is_human,
        }
        if reveal or self.is_human:
            d['hole_cards'] = [c.to_dict() for c in self.hole_cards] if self.hole_cards else []
        else:
            d['hole_cards'] = [{'rank': 0, 'suit': '?', 'name': '?'} for _ in self.hole_cards]
        if reveal and self.hand_info:
            d['hand_desc'] = self.hand_info
        return d


class TexasGame:
    """德州扑克一局游戏的状态机"""

    def __init__(self):
        self.deck = Deck()
        self.players: list[Player] = []
        self.community_cards: list[Card] = []
        self.pot = 0
        self.current_bet = 0       # 本轮当前最高下注
        self.dealer_idx = 0
        self.current_player_idx = 0
        self.phase = 'idle'        # idle | preflop | flop | turn | river | showdown
        self.round_over = False
        self.winners = []          # [(player, hand_desc, amount_won)]
        self.message = ''
        self._init_players()

    def _init_players(self):
        self.players = [
            Player('👤 你', INITIAL_CHIPS, is_human=True),
            Player(BOT_NAMES[0], INITIAL_CHIPS),
            Player(BOT_NAMES[1], INITIAL_CHIPS),
            Player(BOT_NAMES[2], INITIAL_CHIPS),
            Player(BOT_NAMES[3], INITIAL_CHIPS),
        ]

    def _active_players(self):
        return [p for p in self.players if not p.folded]

    def _can_act_players(self):
        return [p for p in self.players if not p.folded and not p.all_in]

    def start_new_round(self):
        """开始新一局"""
        # 淘汰没筹码的玩家（重置筹码）
        for p in self.players:
            if p.chips <= 0:
                p.chips = INITIAL_CHIPS
            p.reset_for_round()

        self.deck = Deck()
        self.deck.shuffle()
        self.community_cards = []
        self.pot = 0
        self.current_bet = BIG_BLIND
        self.phase = 'preflop'
        self.round_over = False
        self.winners = []
        self.message = ''

        # 轮换庄家
        self.dealer_idx = (self.dealer_idx + 1) % len(self.players)

        # 发底牌
        for p in self.players:
            p.hole_cards = self.deck.deal(2)

        # 盲注
        sb_idx = (self.dealer_idx + 1) % len(self.players)
        bb_idx = (self.dealer_idx + 2) % len(self.players)
        self.players[sb_idx].bet(SMALL_BLIND)
        self.players[bb_idx].bet(BIG_BLIND)
        self.pot = SMALL_BLIND + BIG_BLIND

        # 当前行动玩家：大盲注之后
        act_idx = (bb_idx + 1) % len(self.players)
        self._advance_to_next_player(act_idx)

    def _advance_to_next_player(self, start_idx):
        """跳到下一个可行动的玩家。如果本轮结束则推进到下一阶段。"""
        # 检查是否所有人已行动且下注平齐
        active = self._can_act_players()
        if len(active) <= 1 and len(self._active_players()) <= 1:
            # 只剩 ≤1 个可行动玩家，直接摊牌
            self._advance_phase()
            return

        # 找到下一个可行动的玩家
        idx = start_idx
        for _ in range(len(self.players)):
            p = self.players[idx]
            if not p.folded and not p.all_in and p.current_bet < self.current_bet:
                # 这个玩家还需要行动
                self.current_player_idx = idx
                if p.is_human:
                    return  # 等待玩家操作
                else:
                    self._bot_action(idx)
                    # bot 行动后继续推进
                    next_idx = (idx + 1) % len(self.players)
                    if not self.round_over:
                        self._advance_to_next_player(next_idx)
                    return
            idx = (idx + 1) % len(self.players)

        # 所有人已平齐 → 进入下一阶段
        self._advance_phase()

    def _advance_phase(self):
        """进入下一阶段"""
        # 重置当前下注
        for p in self.players:
            self.pot += p.current_bet
            p.total_bet += p.current_bet
            p.current_bet = 0
        self.current_bet = 0

        active = self._can_act_players()
        active_all = self._active_players()

        if len(active_all) <= 1:
            # 只剩 ≤1 个活跃玩家，直接结束
            self._showdown()
            return

        if self.phase == 'preflop':
            self.phase = 'flop'
            self.community_cards = self.deck.deal(3)
        elif self.phase == 'flop':
            self.phase = 'turn'
            self.community_cards.append(self.deck.deal())
        elif self.phase == 'turn':
            self.phase = 'river'
            self.community_cards.append(self.deck.deal())
        elif self.phase == 'river':
            self._showdown()
            return

        # 新一轮从庄家后第一个开始
        start = (self.dealer_idx + 1) % len(self.players)
        if len(active) > 0:
            self._advance_to_next_player(start)
        else:
            self._showdown()

    def _showdown(self):
        """摊牌，判定赢家"""
        self.phase = 'showdown'
        self.round_over = True
        # 把当前下注加入底池
        for p in self.players:
            self.pot += p.current_bet
            p.current_bet = 0

        # 仍活跃的玩家
        active = [p for p in self.players if not p.folded]

        if len(active) == 1:
            # 唯一的幸存者
            winner = active[0]
            winner.chips += self.pot
            winner.hand_info = '对手全弃牌'
            self.winners = [(winner, '对手全弃牌', self.pot)]
            self.pot = 0
            self.message = f'{winner.name} 赢得 {self.winners[0][2]} 筹码！'
            return

        # 多人摊牌：评分
        scored = []
        for p in active:
            all_cards = p.hole_cards + self.community_cards
            ht, best5, desc = evaluate_best_hand(all_cards)
            p.hand_info = desc
            scored.append((p, ht, _eval_5(best5)[1], desc))

        # 按手牌降序排列
        scored.sort(key=lambda x: (x[1], x[2]), reverse=True)

        # 找赢家（可能有平局）
        best = scored[0]
        winners = [s for s in scored if s[1] == best[1] and s[2] == best[2]]
        each_win = self.pot // len(winners)
        remainder = self.pot - each_win * len(winners)

        for p, _, _, desc in winners:
            win_amount = each_win + (remainder if p == winners[0][0] else 0)
            p.chips += win_amount
            p.hand_info = desc
            self.winners.append((p, desc, win_amount))

        self.pot = 0
        names = '、'.join(w[0].name for w in self.winners)
        self.message = f'{names} 以【{self.winners[0][1]}】赢得 {each_win * len(winners)} 筹码！'

    # ── Bot AI ────────────────────────────────────────────────────────────────

    def _bot_action(self, idx):
        """bot 决策"""
        p = self.players[idx]
        call_amount = self.current_bet - p.current_bet

        # 评估手牌强度
        if self.phase == 'preflop':
            strength = _hole_card_strength(p.hole_cards[0], p.hole_cards[1])
        else:
            all_cards = p.hole_cards + self.community_cards
            ht, best5, desc = evaluate_best_hand(all_cards)
            _, ranks = _eval_5(best5)
            strength = _hand_strength_percentile(ht, ranks)

        # 加随机扰动
        strength += random.uniform(-0.08, 0.08)
        strength = max(0.0, min(1.0, strength))

        pot_odds = call_amount / (self.pot + call_amount + 0.01)

        if strength > 0.85:
            # 强牌：加注
            raise_amt = call_amount + random.randint(BIG_BLIND, BIG_BLIND * 4)
            raise_amt = max(raise_amt, BIG_BLIND)
            if raise_amt > p.chips:
                raise_amt = p.chips
            if raise_amt <= call_amount:
                self._do_call(p, call_amount)
            else:
                self._do_raise(p, call_amount, raise_amt)
        elif strength > 0.55:
            # 中等牌：跟注
            if call_amount <= p.chips * 0.3:
                self._do_call(p, call_amount)
            elif call_amount > 0 and strength > 0.65:
                self._do_call(p, call_amount)
            else:
                self._do_fold(p)
        elif strength > 0.30:
            # 弱牌：小额才跟
            if call_amount == 0:
                self._do_check(p)
            elif call_amount <= BIG_BLIND * 2:
                self._do_call(p, call_amount)
            else:
                self._do_fold(p)
        else:
            # 非常弱：过牌或弃牌
            if call_amount == 0:
                self._do_check(p)
            else:
                self._do_fold(p)

    def _do_fold(self, p):
        p.folded = True
        self.message = f'{p.name} 弃牌'

    def _do_check(self, p):
        self.message = f'{p.name} 过牌'

    def _do_call(self, p, amount):
        actual = p.bet(amount)
        self.pot += actual
        self.message = f'{p.name} 跟注 {actual}'

    def _do_raise(self, p, call_amount, total_amount):
        p.bet(total_amount)
        self.pot += total_amount
        self.current_bet = p.current_bet
        self.message = f'{p.name} 加注到 {p.current_bet}'

    # ── 玩家操作 ──────────────────────────────────────────────────────────────

    def player_action(self, action, amount=0):
        """真人玩家的操作。action: 'fold' | 'call' | 'raise'"""
        if self.round_over:
            return {'error': '本局已结束，请开始新局'}
        p = self.players[self.current_player_idx]
        if not p.is_human or p.folded or p.all_in:
            return {'error': '不是你的回合'}

        call_amount = self.current_bet - p.current_bet

        if action == 'fold':
            p.folded = True
            self.message = '你选择弃牌'

        elif action == 'call':
            if call_amount == 0:
                self.message = '你选择过牌'
            else:
                actual = p.bet(call_amount)
                self.pot += actual
                self.message = f'你跟注 {actual}'

        elif action == 'raise':
            if amount < self.current_bet + BIG_BLIND:
                min_raise = self.current_bet + BIG_BLIND
                return {'error': f'加注至少需要 {min_raise} 筹码'}
            if amount > p.chips + p.current_bet:
                amount = p.chips + p.current_bet  # all-in
            actual_bet = amount - p.current_bet
            # 先把 call 部分下了
            to_bet = amount - p.current_bet
            if to_bet <= 0:
                return {'error': '加注金额不足'}
            p.bet(to_bet)
            self.pot += to_bet
            self.current_bet = p.current_bet
            if p.all_in:
                self.message = f'你全押 All-in {p.current_bet}！'
            else:
                self.message = f'你加注到 {p.current_bet}'
        else:
            return {'error': '无效操作'}

        # 推进到下一个玩家
        next_idx = (self.current_player_idx + 1) % len(self.players)
        self._advance_to_next_player(next_idx)
        return {'ok': True}

    def get_state(self):
        """返回当前游戏状态的 JSON 可序列化字典"""
        state = {
            'phase': self.phase,
            'pot': self.pot,
            'current_bet': self.current_bet,
            'dealer_idx': self.dealer_idx,
            'current_player_idx': self.current_player_idx,
            'round_over': self.round_over,
            'message': self.message,
            'community_cards': [c.to_dict() for c in self.community_cards],
            'players': [p.to_dict(reveal=self.round_over) for p in self.players],
            'winners': [],
        }
        for w in self.winners:
            state['winners'].append({
                'name': w[0].name,
                'hand_desc': w[1],
                'amount': w[2],
            })
        return state


# ═══════════════════════════════════════════════════════════════════════════
# 全局游戏实例
# ═══════════════════════════════════════════════════════════════════════════

_game_instance = None


def get_game():
    global _game_instance
    if _game_instance is None:
        _game_instance = TexasGame()
    return _game_instance

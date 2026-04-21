from bson.decimal128 import Decimal128
import requests
import pymongo
import time


class GateKine:
    def __init__(self):
        self.range_hour = 20
        self.gate_url = [{"1m": "https://data.gateio.io/api2/1/candlestick2/eth_usdt?group_sec=60&range_hour=8"},
                         {"5m": "https://data.gateio.io/api2/1/candlestick2/eth_usdt?group_sec=300&range_hour={0}"
                             .format(self.range_hour)},
                         {"15m": "https://data.gateio.io/api2/1/candlestick2/eth_usdt?group_sec=900&range_hour={0}"
                             .format(self.range_hour)},
                         {"30m": "https://data.gateio.io/api2/1/candlestick2/eth_usdt?group_sec=1800&range_hour={0}"
                             .format(self.range_hour)},
                         {"1h": "https://data.gateio.io/api2/1/candlestick2/eth_usdt?group_sec=3600&range_hour={0}"
                             .format(self.range_hour)},
                         {"8h": "https://data.gateio.io/api2/1/candlestick2/eth_usdt?group_sec=28800&range_hour={0}"
                             .format(self.range_hour)}]

        self.blockcc_url = [{"5m": "https://data.block.cc/api/v1/kline?"
                                   "market=bitfinex&symbol_pair=ETH_USD&type=5m&limit=20000"}]

        self.pairName = "ETH_USDT"

    #    time: 时间戳
    #    volume: 交易量
    #    close: 收盘价
    #    high: 最高价
    #    low: 最低价
    #    open: 开盘价
    @staticmethod
    def _get_kline_data(url):
        result = requests.get(url).json()
        if result["result"]:
            return result
        raise requests.exceptions.BaseHTTPError

    # 将gate的数据组装成数据库的数据并返回一个list
    def _fix_data(self, data, rangeType):
        result_list = []
        for item in data:
            result = {
                "start": Decimal128(item[5]),
                "end": Decimal128(item[2]),
                "high": Decimal128(item[3]),
                "low": Decimal128(item[4]),
                "vol": Decimal128(item[1]),
                "pairName": self.pairName,
                "rangeType": rangeType,
                "createTime": float(item[0])
            }
            result_list.append(result)
        return result_list

    @staticmethod
    def _save_mongo(list_data):
        k_line = pymongo.MongoClient("mongodb://mongo1.com:30001,mongo2.com:30002,mongo3.com:30003"
                                     "/bb_trade?replicaSet=my-mongo-set").bb_trade.k_line
        return k_line.insert_many(list_data)

    def run(self):
        for item in self.gate_url:
            for k, v in item.items():
                print(k, v)
                gate_data = self._get_kline_data(v)["data"]
                result = self._save_mongo(self._fix_data(gate_data, k))
                print(result)
                time.sleep(0.5)



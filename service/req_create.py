import http.client
import traceback
import json
import threading
import time


class Request:
    def __init__(self, service_url, Token=""):
        self.Token = Token
        self.service_url = service_url

    def _request(self, **kwargs):
        """
        post请求
        :param kwargs: method="GET", data=None,
                host='116.62.37.4', port=28802, uri='/api/interchangeair/'
        :return: 返回的body
        """
        data = kwargs.get("data")
        if (data != "") & (data is not None):
            pass
        else:
            data = None

        headers = {"Content-type": "application/json;charset=utf-8",
                   "Accept": "application/json",
                   "content-language": "zh-CN",
                   "Token": self.Token
                   }

        conn = ""
        response_byte = ""

        try:
            conn = http.client.HTTPConnection(kwargs.get("host"), kwargs.get("port"), timeout=300)
            conn.request(kwargs.get("method"), kwargs.get("uri"),
                         data, headers)
            response_byte = conn.getresponse().read()
            response = response_byte.decode('utf-8')
        except UnicodeDecodeError:
            response = response_byte.decode('gbk')
        except Exception as e:
            traceback.print_exc()
            return "接口调用未知错误，错误信息：%s" % e
        finally:
            conn.close()

        return str(response)

    def post(self, *args):
        return self._request(host=self.service_url,
                             port=80,
                             uri=args[0],
                             data=args[1],
                             method="POST")


class ReqCreate:
    def __init__(self):
        self.num = 0

    def req_create_ready(self):
        data = {
            "appId": "platform",
            "pin": "5c1385e7516e94679068037f",
            "pairName": "ETH_USDT",
            "isBuy": False,
            "amount": "1",
            "price": "100"
        }

        result = Request("bbsupply.test.net").post("/req/create", json.dumps(data))
        print(result)
        if json.loads(result)["success"] is True:
            self.num += 1

    def req_create(self, count, loop, sec):
        for i in range(loop):
            for j in range(count):
                thread = threading.Thread(args=(), target=ReqCreate().req_create_ready)
                thread.start()
            time.sleep(sec)

        return json.dumps({"success": True, "success_num": self.num})


if __name__ == '__main__':
    print(ReqCreate().req_create(10, 10, 1))


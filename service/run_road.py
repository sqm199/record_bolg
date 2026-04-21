import pymongo
import redis


def get_redis_conn():
    pool = redis.ConnectionPool(host='192.168.0.12', port=6379, db=15)
    return redis.Redis(connection_pool=pool)


def get_mongo_conn():
    db = pymongo.MongoClient("mongodb://mongo1.com:30001,mongo2.com:30002,mongo3.com:30003"
                             "/bb_trade?replicaSet=my-mongo-set")
    return db


def del_redis_keys():
    r = get_redis_conn()
    print(r.keys())
    for item in r.keys():
        print(r.delete(item))


def del_mongo_collect():
    db = get_mongo_conn()
    db.bbsupply.bill_info_entity.remove()
    db.bbsupply.del_req_entity.remove()
    db.bbsupply.req_info_entity.remove()
    db.bb_trade.bill_record.remove()
    db.bb_trade.entrust_record.remove()
    db.bb_trade.k_line.remove()


if __name__ == '__main__':
    del_redis_keys()
    del_mongo_collect()



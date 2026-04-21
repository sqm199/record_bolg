import pymysql


class Sql(object):
    def __init__(self, sql, dbname):
        self.sql = sql
        self.dbname = dbname

    def execute(self):
        global cur, conn
        try:
            # 获取一个数据库连接，注意如果是UTF-8类型的，需要制定数据库
            conn = pymysql.connect(host='localhost',
                                   user='root',
                                   passwd='0613abcd',
                                   db=self.dbname,
                                   port=3306,
                                   charset='utf8')
            cur = conn.cursor()  # 获取一个游标
            cur.execute(self.sql)
            if "UPDATE" in self.sql:
                conn.commit()
                return cur.rowcount
            if "INSERT" in self.sql:
                b = conn.commit()
                return cur.rowcount
            if "SELECT" in self.sql:
                data = cur.fetchall()
                return data
        except Exception as e:
            print("操作失败:", e)
        finally:
            cur.close()  # 关闭游标
            conn.close()  # 释放数据库资源

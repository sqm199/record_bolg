import time

class Movie(object):
    def __init__(self,
                 num=1,
                 name="",
                 money="",
                 moneytype=1,
                 href="",
                 productType=1,
                 productTypeRemark="",
                 Remark="",
                 source="豆瓣",
                 IsDelete=0,
                 AddTime=time.strftime('%Y-%m-%d %H:%M:%S',time.localtime(time.time())),
                 AddPerson="sys",
                 ModifyTime=time.strftime('%Y-%m-%d %H:%M:%S',time.localtime(time.time()))):
        self.Num = num
        self.Name = name
        self.Source = source
        self.Money = money
        self.MoneyType = moneytype
        self.Href = href
        self.ProductType = productType
        self.ProductTypeRemark = productTypeRemark
        self.Remark = Remark
        self.IsDelete = IsDelete
        self.AddTime = AddTime
        self.AddPerson = AddPerson
        self.ModifyTime = ModifyTime

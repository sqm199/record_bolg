import time

class Codemanageinfo(object):
    def __init__(self,
                 KeyID="",
                 ProductLine=0,
                 ProductLineName="",
                 Product=0,
                 ProductName="",
                 EnglishSystemName="",
                 SystemName="",
                 SystemTypeName="",
                 SystemTypeID=0,
                 SvcName="",
                 YFTrunkAddress="",
                 CSTrunkAddress="",
                 Remarks="",
                 AddTime=time.strftime('%Y-%m-%d %H:%M:%S',time.localtime(time.time())),
                 ModifyTime=time.strftime('%Y-%m-%d %H:%M:%S',time.localtime(time.time())),
                 ModifyUser="sys",
                 AddUser="sys",
                 IsDelete=0):
        self.KeyID = KeyID
        self.ProductLine = ProductLine
        self.ProductLineName = ProductLineName
        self.Product = Product
        self.ProductName = ProductName
        self.EnglishSystemName = EnglishSystemName
        self.SystemName = SystemName
        self.SystemTypeName = SystemTypeName
        self.SystemTypeID = SystemTypeID
        self.SvcName = SvcName
        self.YFTrunkAddress = YFTrunkAddress
        self.CSTrunkAddress = CSTrunkAddress
        self.Remarks = Remarks
        self.AddTime = AddTime
        self.AddUser = AddUser
        self.ModifyTime = ModifyTime
        self.IsDelete = IsDelete
        self.ModifyUser = ModifyUser
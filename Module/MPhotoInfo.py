import time

class Photo(object):
    def __init__(self, KeyID="", Name="", ProductType="", ProductTypeRemark="", Remark="", IsDelete=0,
                 AddTime=time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(time.time())),
                 AddPerson="sys",
                 ModifyTime=time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(time.time()))):
        self.KeyID = KeyID
        self.Name = Name
        self.ProductType = ProductType
        self.ProductTypeRemark = ProductTypeRemark
        self.Remark = Remark
        self.IsDelete = IsDelete
        self.AddTime = AddTime
        self.AddPerson = AddPerson
        self.ModifyTime = ModifyTime

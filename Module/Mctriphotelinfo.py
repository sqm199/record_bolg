class Mctriphotelinfo(object):
    def __init__(self,
                 OrderID="",
                 Account="",
                 HotelName="",
                 Name="",
                 LiveTime="",
                 LiveFee="",
                 OrderStatus="",
                 BillType=0,
                 IsApplyBll=0,
                 Remark="",
                 AddTime="",
                 ModifyTime=""
                 ):
        self.OrderID = OrderID,
        self.Account = Account,
        self.HotelName = HotelName,
        self.Name = Name,
        self.LiveTime = LiveTime,
        self.LiveFee = LiveFee,
        self.OrderStatus = OrderStatus,
        self.BillType = BillType
        self.IsApplyBll = IsApplyBll,
        self.Remark = Remark
        self.AddTime = AddTime
        self.ModifyTime = ModifyTime
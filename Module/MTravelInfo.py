import time

SPOT_TYPES = ('start', 'food', 'hotel', 'sight', 'way', 'end')

class Spot(object):
    def __init__(self, SpotID="", Type="sight", Name="", Address="", LngLat="", Remark="",
                 AddTime=time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(time.time()))):
        self.SpotID = SpotID
        self.Type = Type
        self.Name = Name
        self.Address = Address
        self.LngLat = LngLat
        self.Remark = Remark
        self.AddTime = AddTime

class TravelPlan(object):
    def __init__(self, KeyID="", Name="", Date="", Note="", Spots=None, Legs=None, IsDelete=0,
                 AddTime=time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(time.time())),
                 AddPerson="sys",
                 ModifyTime=time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(time.time()))):
        self.KeyID = KeyID
        self.Name = Name
        self.Date = Date
        self.Note = Note
        self.Spots = Spots if Spots is not None else []
        self.Legs = Legs if Legs is not None else []
        self.IsDelete = IsDelete
        self.AddTime = AddTime
        self.AddPerson = AddPerson
        self.ModifyTime = ModifyTime

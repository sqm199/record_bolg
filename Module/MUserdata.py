import time

class Userdata(object):
    def __init__(self,
                 KeyID="", UserName="", UserAccount="", LoginPWD=0, PaymentPWD="", UserPhone="", UserEmail="",
                 Nationality="", Sex=0, BirthDate="", Photo="", TokenCreateTime="", LastOperateTime="",Token="",
                 AddTime=time.strftime('%Y-%m-%d %H:%M:%S',time.localtime(time.time())),
                 ModifyTime=time.strftime('%Y-%m-%d %H:%M:%S',time.localtime(time.time())),
                 ModifyUser="sys",
                 AddUser="sys",
                 IsDelete=0):
        self.KeyID = KeyID
        self.UserName = UserName
        self.UserAccount = UserAccount
        self.LoginPWD = LoginPWD
        self.PaymentPWD = PaymentPWD
        self.UserPhone = UserPhone
        self.UserEmail = UserEmail
        self.Nationality = Nationality
        self.Sex = Sex
        self.BirthDate = BirthDate
        self.Photo = Photo
        self.TokenCreateTime = TokenCreateTime
        self.LastOperateTime = LastOperateTime
        self.Token = Token
        self.AddTime = AddTime
        self.AddUser = AddUser
        self.ModifyTime = ModifyTime
        self.IsDelete = IsDelete
        self.ModifyUser = ModifyUser
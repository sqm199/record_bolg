import time

class Mtestplaninfo(object):
    def __init__(self,
                 CodeName="",
                 TestManName="",
                 LeaderName="",
                 Remarks="",
                 IsDelete=0):
        self.CodeName = CodeName
        self.TestManName = TestManName
        self.LeaderName = LeaderName
        self.Remarks = Remarks
        self.IsDelete = IsDelete
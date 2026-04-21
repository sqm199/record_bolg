/**
* Created by zhongni on 15-07-03.
*/
(function ($) {
    $.fn.downwardToolTips = function (currentTipsInfo) {//text:内容,arrowDirection:箭头浮动方向
        if ($("body").find(".downwardtooltipsdiv").length === 0)
        { $("body").append("<div class='downwardtooltipsdiv' style='display:none;position:absolute;z-index:9999'><span></span><strong></strong><em></em></div>"); }//加一个div 让下面的span 宽度自适应
        $("body").find(".downwardtooltipsdiv span:first").css(
        {
            "height": "auto",
            "color": "#000000",
            "position": "absolute",
            "padding": "10px",
            "display": "block",
            "visibility": "visible",
            "background-color": "#FFFFEB",
            "border": "1px solid #FFCC99",
            "font-family": 'Arial Normal',
            "font-weight": "400",
            "font-style": "normal",
            "font-size": "13px",
            "text-align": "left",
            "line-height": "normal"
        });
        $("body").find(".downwardtooltipsdiv strong:last").css(
        {
            "position": "absolute",
            "bottom": "100%",
            "width": "0",
            "height": "0",
            "border-bottom": "8px solid #FFCC99",
            "border-right": "8px solid transparent",
            "border-left": "8px solid transparent"
        });
        $("body").find(".downwardtooltipsdiv em:last").css(
        {
            "position": "absolute",
            "bottom": "100%",
            "width": "0",
            "height": "0",
            "border-bottom": "8px solid #FFFFEB",
            "border-right": "8px solid transparent",
            "border-left": "8px solid transparent",
            "top": "-7px",
            "z-index": "1000"
        });
        var self = $("body").find(".downwardtooltipsdiv");//整个浮动框
        $(this).hover(function () {
            //如果没有传参数，加载默认参数
            var tipsInfo = {
                tipsText: currentTipsInfo.tipsText === undefined ? "Please insert text here!" : currentTipsInfo.tipsText,//用于显示的文字
                tipsBorderColor: currentTipsInfo.tipsBorderColor === undefined ? "#FFCC99" : currentTipsInfo.tipsBorderColor,
                tipsBackgroundColor: currentTipsInfo.tipsBackgroundColor === undefined ? "#FFFFEB" : currentTipsInfo.tipsBackgroundColor,
                tipsFontColor: currentTipsInfo.tipsFontColor === undefined ? "#000000" : currentTipsInfo.tipsFontColor,
                tipsWidth: currentTipsInfo.tipsWidth === undefined ? -1 : currentTipsInfo.tipsWidth,
                tipsDirection: currentTipsInfo.tipsDirection === undefined ? "right" : currentTipsInfo.tipsDirection,//tooltips整体浮动方向
                tipsDirectionDistance: currentTipsInfo.tipsDirectionDistance === undefined ? 0 : currentTipsInfo.tipsDirectionDistance,//tooltips整体浮动距离
                tipsArrowDistance: currentTipsInfo.tipsArrowDistance === undefined ? 100 : currentTipsInfo.tipsArrowDistance,//箭头离tooltips中心的距离,左边为正数，右边为负数
                tipsTopDistance: currentTipsInfo.tipsTopDistance === undefined ? $(this).height() + 6 : currentTipsInfo.tipsTopDistance,//tips离被激活元素的TOP距离
            };

            self.show();
            self.find("span:first").html(tipsInfo.tipsText);
            self.find("span:first").css("border", "1px solid " + tipsInfo.tipsBorderColor); //#FFCC99
            self.find("strong:last").css("border-bottom", "8px solid " + tipsInfo.tipsBorderColor);
            self.find("span:first").css("background-color", tipsInfo.tipsBackgroundColor); //#FFCC99
            self.find("em:last").css("border-bottom", "8px solid " + tipsInfo.tipsBackgroundColor);
            self.find("span:first").css("color", tipsInfo.tipsFontColor); //#FFCC99
            if (tipsInfo.tipsWidth !== -1) {
                if (tipsInfo.tipsWidth < 100) {
                    tipsInfo.tipsWidth = "100";
                }
                self.find("span:first").css("width", tipsInfo.tipsWidth);
            }
            var middleDivPosition = self.find("span").width() / 2;
            if (tipsInfo.tipsDirection === "left") {
                self.css({ "top": $(this).offset().top + tipsInfo.tipsTopDistance, "left": $(this).offset().left - middleDivPosition - tipsInfo.tipsDirectionDistance });
                self.find("strong:last").css({ "left": middleDivPosition - tipsInfo.tipsArrowDistance });
                self.find("em:last").css({ "left": middleDivPosition - tipsInfo.tipsArrowDistance });
            }
            else if (tipsInfo.tipsDirection === "right") {
                self.css({ "top": $(this).offset().top + tipsInfo.tipsTopDistance, "left": $(this).offset().left + tipsInfo.tipsDirectionDistance });
                self.find("strong:last").css({ "left": middleDivPosition - tipsInfo.tipsArrowDistance });
                self.find("em:last").css({ "left": middleDivPosition - tipsInfo.tipsArrowDistance });
            }
            self.hover(function () {
                self.show();
            }, function () {
                self.hide();
            });
        }, function () {
            self.hide();
        });
    };
}(jQuery));

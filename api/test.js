// 성공 공식을 적용한 DetailCommon 함수
async function fetchDetailCommon(apiKey, contentId) {
    const url = `https://apis.data.go.kr/B551011/KorService2/detailCommon2?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=HealingK&_type=json&contentId=${contentId}`;
    
    const response = await fetch(url);
    const data = await response.json();
    
    const code = data.resultCode || data.response?.header?.resultCode;
    
    if (code === '0' || code === '0000') {
        const item = data.response?.body?.items?.item || data.items?.item || data.item;
        if (item) {
            const itemData = Array.isArray(item) ? item[0] : item;
            return {
                overview: itemData.overview || null,
                tel: itemData.tel || null,
                homepage: itemData.homepage || null,
                usetime: itemData.usetime || null,
                parking: itemData.parking || null,
                usefee: itemData.usefee || null
            };
        }
    }
    
    return null;
}

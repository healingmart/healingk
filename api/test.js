// 성공한 DetailCommon 호출 방식
async function fetchDetailCommon(apiKey, contentId) {
    const url = `https://apis.data.go.kr/B551011/KorService2/detailCommon2?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=HealingK&_type=json&contentId=${contentId}`;
    
    try {
        const response = await fetch(url);
        const data = await response.json();
        
        const code = data.resultCode || data.response?.header?.resultCode;
        
        if (code === '0' || code === '0000') {
            const item = data.response?.body?.items?.item || data.items?.item || data.item;
            if (item) {
                const itemData = Array.isArray(item) ? item[0] : item;
                
                // HTML 태그 제거 함수
                const cleanHTML = (text) => text ? text.replace(/<[^>]*>/g, '').trim() : null;
                
                return {
                    overview: itemData.overview || null,
                    tel: itemData.tel || null,
                    homepage: cleanHTML(itemData.homepage) || null,
                    usetime: itemData.usetime || null,
                    restdate: itemData.restdate || null,
                    usefee: itemData.usefee || null,
                    parking: itemData.parking || null,
                    babycarriage: itemData.babycarriage || null,
                    pet: itemData.pet || null,
                    disabled: itemData.disabled || null
                };
            }
        }
        
        return null;
    } catch (error) {
        console.error('DetailCommon 오류:', error);
        return null;
    }
}
